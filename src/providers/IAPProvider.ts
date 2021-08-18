import crypto from "crypto";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";
import fetch from "node-fetch";
import {
  AppleServerNotificationResponseBody,
  AppleVerifyReceiptResponseBody,
} from "types-apple-iap";

import db from "../database";
import { getLogger } from "../logging";
import {
  ParsedReceipt,
  Platform,
  Product,
  Purchase,
  PurchaseEvent,
  PurchaseEventType,
  SubscriptionPeriodType,
  SubscriptionState,
  SubscriptionStatus,
} from "../types";

const logger = getLogger("IAPProvider");

export class IAPProvider {
  async processToken(
    token: string,
    sku: string,
    includeNewer: boolean,
    userId?: string,
    syncUserId?: boolean
  ): Promise<PurchaseEvent> {
    const response = await this.validate(token, sku);
    const parsedReceipt = await this.parseReceipt(
      response,
      token,
      sku,
      includeNewer
    );
    return this.processParsedReceipt(parsedReceipt, userId, syncUserId);
  }

  async processParsedReceipt(
    parsedReceipt: ParsedReceipt,
    userId?: string,
    syncUserId?: boolean
  ): Promise<PurchaseEvent> {
    // Grab our version of the latest purchase from the db so we can compare it later
    const latestPurchase = parsedReceipt.purchases[0];
    let dbPurchase = null;
    if (latestPurchase.isSubscription) {
      dbPurchase = await db.getLatestPurchaseByOriginalOrderId(
        latestPurchase.originalOrderId
      );
    }

    const purchase = await this.saveParsedReceipt(
      parsedReceipt,
      userId,
      syncUserId
    );
    const eventType: PurchaseEventType = this.getPurchaseEventType(
      dbPurchase,
      purchase
    );
    return {
      type: eventType,
      data: purchase,
    };
  }

  async saveParsedReceipt(
    parsedReceipt: ParsedReceipt,
    userId?: string,
    syncUserId?: boolean
  ): Promise<Purchase> {
    // If userId was not passed, lookup user ID from past purchases,
    // if it was, check that it matches what we have on file.
    // If it doesn't match, update all existing purchases with the new userId
    const orderIds = parsedReceipt.purchases.map((item) => item.orderId);
    if (parsedReceipt.purchases[0].isSubscription) {
      orderIds.push(parsedReceipt.purchases[0].originalOrderId);
    }

    const existingUserId = await db.getUserId(orderIds);
    if (!userId) {
      userId = existingUserId;
    } else if (
      syncUserId &&
      existingUserId != null &&
      userId != existingUserId
    ) {
      await db.syncUserId(existingUserId, userId);
    }

    parsedReceipt.receipt.userId = userId;
    let dbReceipt = await db.getReceiptByHash(parsedReceipt.receipt.hash);
    if (!dbReceipt) {
      dbReceipt = await db.createReceipt(parsedReceipt.receipt);
    } else if (userId && dbReceipt.userId !== userId) {
      dbReceipt.userId = userId;
      dbReceipt = await db.updateReceipt(parsedReceipt.receipt);
    }

    // parseReceipt will return purchases sorted desc. Reverse them so we save them
    // in chronological order allowing linked and original purchase links to be established
    const purchases = parsedReceipt.purchases;
    purchases.reverse();
    let returnPurchase = null;
    for (const purchase of purchases) {
      purchase.receiptId = dbReceipt.id;
      if (userId) {
        purchase.userId = userId;
      }

      let dbPurchase = await db.getPurchaseByOrderId(purchase.orderId);

      if (purchase.originalOrderId) {
        const originalPurchase = await db.getPurchaseByOrderId(
          purchase.originalOrderId
        );
        if (originalPurchase) {
          purchase.originalPurchaseId = originalPurchase.id;
        }
      }
      if (purchase.linkedOrderId) {
        const linkedPurchase = await db.getPurchaseByOrderId(
          purchase.linkedOrderId
        );
        if (linkedPurchase) {
          purchase.linkedPurchaseId = linkedPurchase.id;
        }
      }

      if (!dbPurchase) {
        dbPurchase = await db.createPurchase(purchase);
        if (purchase.orderId === purchase.originalOrderId) {
          dbPurchase.originalPurchaseId = dbPurchase.id;
          dbPurchase = await db.updatePurchase(dbPurchase.id, dbPurchase);
        }
      } else {
        purchase.id = dbPurchase.id;
        // Only reprocess this purchase is the current receipt is from before
        // the one we have on file
        // This prevents overwriting historic subscription statuses and token values
        // for old purchases
        if (dbPurchase.receiptDate < purchase.receiptDate) {
          // Maintain the old receipt date and receipt ID
          purchase.receiptId = dbPurchase.receiptId;
          purchase.receiptDate = dbPurchase.receiptDate;
        }

        if (!this.purchasesEqual(dbPurchase, purchase)) {
          dbPurchase = await db.updatePurchase(dbPurchase.id, purchase);
        }
      }

      returnPurchase = dbPurchase;
    }

    return returnPurchase;
  }

  serverNotification(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    notification: AppleServerNotificationResponseBody
  ): Promise<PurchaseEvent> {
    throw Error("Not implemented!");
  }

  validate(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    token: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sku: string
  ): Promise<
    | AppleVerifyReceiptResponseBody
    | androidpublisher_v3.Schema$ProductPurchase
    | androidpublisher_v3.Schema$SubscriptionPurchase
  > {
    throw Error("Not implemented!");
  }

  async parseReceipt(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    receipt:
      | AppleVerifyReceiptResponseBody
      | androidpublisher_v3.Schema$ProductPurchase
      | androidpublisher_v3.Schema$SubscriptionPurchase,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    token: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sku: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    includeNewer: boolean
  ): Promise<ParsedReceipt> {
    throw Error("Not implemented!");
  }

  getSubscriptionPeriodType(purchase: Purchase): SubscriptionPeriodType {
    if (purchase.isTrial) {
      return "trial";
    } else if (purchase.isIntroOfferPeriod) {
      return "intro";
    } else {
      return "normal";
    }
  }

  getSubscriptionState(purchase: Purchase): SubscriptionState {
    if (purchase.isSubscriptionActive) {
      return "active";
    } else if (purchase.isSubscriptionGracePeriod) {
      return "grace_period";
    } else if (purchase.isSubscriptionRetryPeriod) {
      return "retry_period";
    } else {
      return "expired";
    }
  }

  getSubscriptionStatus(purchase: Purchase): SubscriptionStatus {
    if (!purchase.isSubscription) {
      return null;
    }

    let status: SubscriptionStatus = "unknown";

    if (
      purchase.isRefunded &&
      purchase.refundReason !== "subscription_replace"
    ) {
      status = "refunded";
    } else if (purchase.subscriptionState === "paused") {
      status = "paused";
    } else if (
      purchase.subscriptionState === "grace_period" ||
      purchase.isSubscriptionGracePeriod
    ) {
      // Grace period is shorter than retry period so it goes first
      status = "grace_period";
    } else if (
      purchase.subscriptionState === "retry_period" ||
      purchase.isSubscriptionRetryPeriod
    ) {
      status = "retry_period";
    } else if (
      purchase.subscriptionState === "expired" ||
      (!purchase.isSubscriptionActive && !purchase.isSubscriptionRenewable)
    ) {
      status = "expired";
    } else if (
      // Check for cancelled trial before normal sub - we immediately expired cancelled trials.
      purchase.subscriptionPeriodType === "trial"
    ) {
      if (!purchase.isSubscriptionRenewable) {
        status = "expired";
      } else {
        status = "trial";
      }
    } else if (
      purchase.isSubscriptionActive &&
      !purchase.isSubscriptionRenewable
    ) {
      // Has cancelled before expiration date
      if (new Date() < purchase.expirationDate) {
        status = "cancelled";
      } else {
        status = "expired";
      }
    } else if (purchase.subscriptionState === "active") {
      status = "active";
    }

    return status;
  }

  async getProduct(sku: string, platform: Platform): Promise<Product | null> {
    return db.getProductBySku(sku, platform);
  }

  getHash(token: string): string {
    return crypto.createHash("md5").update(token).digest("hex");
  }

  purchasesEqual(left: Purchase, right: Purchase): boolean {
    return (
      left.id === right.id &&
      left.receiptId === right.receiptId &&
      left.productId === right.productId &&
      left.isSandbox === right.isSandbox &&
      left.isRefunded === right.isRefunded &&
      left.platform === right.platform &&
      left.orderId === right.orderId &&
      left.productSku === right.productSku &&
      left.productType === right.productType &&
      this.compareDates(left.purchaseDate, right.purchaseDate) &&
      left.price === right.price &&
      left.currency === right.currency &&
      left.convertedPrice === right.convertedPrice &&
      left.convertedCurrency === right.convertedCurrency &&
      this.compareDates(left.receiptDate, right.receiptDate) &&
      this.compareDates(left.refundDate, right.refundDate) &&
      left.refundReason === right.refundReason &&
      left.isSubscription === right.isSubscription &&
      left.isTrial === right.isTrial &&
      left.isIntroOfferPeriod === right.isIntroOfferPeriod &&
      left.isSubscriptionActive === right.isSubscriptionActive &&
      left.isSubscriptionRenewable === right.isSubscriptionRenewable &&
      left.isSubscriptionRetryPeriod === right.isSubscriptionRetryPeriod &&
      left.isSubscriptionGracePeriod === right.isSubscriptionGracePeriod &&
      left.isSubscriptionPaused === right.isSubscriptionPaused &&
      left.originalOrderId === right.originalOrderId &&
      left.linkedOrderId === right.linkedOrderId &&
      left.subscriptionPeriodType === right.subscriptionPeriodType &&
      left.subscriptionState === right.subscriptionState &&
      left.subscriptionStatus === right.subscriptionStatus &&
      left.subscriptionGroup === right.subscriptionGroup &&
      left.subscriptionRenewalProductSku ===
        right.subscriptionRenewalProductSku &&
      left.cancellationReason === right.cancellationReason &&
      this.compareDates(left.expirationDate, right.expirationDate) &&
      this.compareDates(left.gracePeriodEndDate, right.gracePeriodEndDate) &&
      left.linkedToken === right.linkedToken
    );
  }

  compareDates(left: Date | null, right: Date | null): boolean {
    if (!left && !!right) {
      return false;
    } else if (!!left && !right) {
      return false;
    } else if (!!left && !!right) {
      return left.getTime() === right.getTime();
    }
    return true;
  }

  async getConvertedPrice(
    price: number,
    baseCurrency: string,
    targetCurrency: string,
    date: Date
  ): Promise<number> {
    baseCurrency = baseCurrency.toLowerCase();
    targetCurrency = targetCurrency.toLowerCase();
    const today = new Date().toISOString().split("T")[0];
    let dateFormatted = date.toISOString().split("T")[0];
    if (today === dateFormatted) {
      // The repo may not be up-to-date with today's data yet
      dateFormatted = "latest";
    }
    const url = `https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/${dateFormatted}/currencies/${baseCurrency}.json`;
    const response = await fetch(url);
    if (response.status !== 200) {
      throw Error(`Failed to get forex data with status ${response.status}`);
    }

    const result = await response.json();
    if (result[baseCurrency][targetCurrency]) {
      return (price * result[baseCurrency][targetCurrency]) | 0; // Truncate decimals - we work in cents
    } else {
      throw Error(`Currency ${targetCurrency} not found in forex data`);
    }
  }

  getPurchaseEventType(
    oldPurchase: Purchase,
    newPurchase: Purchase
  ): PurchaseEventType {
    let serverUpdateType: PurchaseEventType = "no_change";
    if (
      !newPurchase.isSubscription ||
      !oldPurchase ||
      oldPurchase.originalOrderId !== newPurchase.originalOrderId ||
      (oldPurchase.subscriptionStatus === "expired" &&
        newPurchase.subscriptionStatus === "active")
    ) {
      serverUpdateType = "purchase";
    } else if (!oldPurchase.isRefunded && newPurchase.isRefunded) {
      serverUpdateType = "refund";
    } else if (oldPurchase.productSku !== newPurchase.productSku) {
      serverUpdateType = "subscription_replace";
    } else if (
      oldPurchase.subscriptionStatus !== newPurchase.subscriptionStatus
    ) {
      if (newPurchase.subscriptionStatus === "retry_period") {
        serverUpdateType = "subscription_renewal_retry";
      } else if (newPurchase.subscriptionStatus === "cancelled") {
        serverUpdateType = "subscription_cancel";
      } else if (newPurchase.subscriptionStatus === "expired") {
        if (oldPurchase.isSubscriptionGracePeriod) {
          serverUpdateType = "subscription_grace_period_expire";
        } else {
          serverUpdateType = "subscription_expire";
        }
      } else if (
        oldPurchase.subscriptionStatus === "cancelled" &&
        newPurchase.subscriptionStatus === "active"
      ) {
        serverUpdateType = "subscription_uncancel";
      } else if (
        !oldPurchase.subscriptionRenewalProductSku &&
        newPurchase.subscriptionRenewalProductSku &&
        newPurchase.productSku !== newPurchase.subscriptionRenewalProductSku
      ) {
        serverUpdateType = "subscription_product_change";
      }
    } else if (oldPurchase.orderId !== newPurchase.orderId) {
      serverUpdateType = "subscription_renewal";
    }

    return serverUpdateType;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendPurchaseWebhook(purchaseEvent: PurchaseEvent): Promise<void> {
    if (purchaseEvent.type === "no_change") {
      logger.debug("Will not send purchase webhook: no_change update type");
    } else if (process.env.WEBHOOK_OUTGOING_ENDPOINT) {
      try {
        await fetch(process.env.WEBHOOK_OUTGOING_ENDPOINT, {
          method: "post",
          body: JSON.stringify(purchaseEvent),
          headers: {
            "Content-Type": "application/json",
            "x-auth-token": process.env.WEBHOOK_AUTH_TOKEN,
          },
        });
        logger.debug("Successfully sent purchase webhook");
      } catch (e) {
        logger.error(`Failed to send purchase webhook: ${e.message}`);
      }
    } else {
      logger.debug("Will not send purchase webhook: Webhooks not enabled");
    }
  }
}
