import crypto from "crypto";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";
import fetch from "node-fetch";
import { AppleVerifyReceiptResponseBody } from "types-apple-iap";

import db from "../database";
import {
  ParsedReceipt,
  Platform,
  Product,
  Purchase,
  SubscriptionPeriodType,
  SubscriptionState,
  SubscriptionStatus,
} from "../types";

export class IAPProvider {
  async purchase(
    token: string,
    sku: string,
    includeNewer: boolean,
    userId?: string,
    syncUserId?: boolean
  ): Promise<Purchase> {
    const response = await this.validate(token, sku);
    const parsedReceipt = await this.parseReceipt(
      response,
      token,
      sku,
      includeNewer
    );

    // If userId was not passed, lookup user ID from past purchases,
    // if it was, check that it matches what we have on file.
    // If it doesn't match, update all existing purchases with the new userId
    const existingUserId = await db.getUserId(
      parsedReceipt.purchases.map((item) => item.orderId)
    );
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
    } else {
      if (userId) {
        dbReceipt.userId = userId;
      }
      dbReceipt = await db.updateReceipt(dbReceipt);
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

      if (
        purchase.platform === "android" &&
        purchase.isSubscription &&
        purchase.linkedToken
      ) {
        const linkedHash = this.getHash(purchase.linkedToken);
        const linkedPurchases = await db.getPurchasesByReceiptHash(linkedHash);
        if (linkedPurchases.length) {
          purchase.linkedOrderId = linkedPurchases[0].orderId;
          purchase.originalOrderId = linkedPurchases[0].originalOrderId;
        }
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
        // Only reprocess this purchase is the current receipt is from before
        // the one we have on file
        // This prevents overwriting historic subscription statuses and token values
        // for old purchases
        if (dbPurchase.receiptDate >= purchase.receiptDate) {
          dbPurchase = await db.updatePurchase(dbPurchase.id, purchase);
        }
      }

      returnPurchase = dbPurchase;
    }

    return returnPurchase;
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
}
