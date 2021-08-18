import { google, GoogleApis } from "googleapis";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";

import db from "../database";
import { getLogger } from "../logging";
import {
  CancellationReason,
  ParsedReceipt,
  Purchase,
  PurchaseEvent,
  Receipt,
} from "../types";
import { IAPProvider } from "./IAPProvider";

const logger = getLogger("Google");

export class Google extends IAPProvider {
  clientEmail = "";
  privateKey = "";

  constructor(clientEmail: string, privateKey: string) {
    super();
    this.clientEmail = clientEmail;
    this.privateKey = privateKey;
  }

  async getClient(): Promise<GoogleApis> {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: this.clientEmail,
        private_key: this.privateKey,
      },
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });
    return google;
  }

  async validatePurchase(
    token: string,
    sku: string
  ): Promise<androidpublisher_v3.Schema$ProductPurchase> {
    const client = await this.getClient();
    const response = await client
      .androidpublisher({
        version: "v3",
      })
      .purchases.products.get({
        packageName: process.env.ANDROID_PACKAGE_NAME,
        productId: sku,
        token,
      });
    return response.data;
  }

  async validateSubscription(
    token: string,
    sku: string
  ): Promise<androidpublisher_v3.Schema$SubscriptionPurchase> {
    const client = await this.getClient();
    const response = await client
      .androidpublisher({
        version: "v3",
      })
      .purchases.subscriptions.get({
        packageName: process.env.ANDROID_PACKAGE_NAME,
        subscriptionId: sku,
        token,
      });
    return response.data;
  }

  async getVoidedPurchases(): Promise<androidpublisher_v3.Schema$VoidedPurchasesListResponse> {
    // @TODO: Test if we can use this to find refund info on purchases/subscriptions
    const client = await this.getClient();
    const response = await client
      .androidpublisher({
        version: "v3",
      })
      .purchases.voidedpurchases.list({
        packageName: process.env.ANDROID_PACKAGE_NAME,
        type: 1,
      });
    return response.data;
  }

  async validate(
    token: string,
    sku: string
  ): Promise<
    | androidpublisher_v3.Schema$ProductPurchase
    | androidpublisher_v3.Schema$SubscriptionPurchase
  > {
    // First try as a purchase, if that fails try as a subscription
    let purchase;
    try {
      purchase = await this.validatePurchase(token, sku);
    } catch (e) {
      if (
        e.code === 400 &&
        e.errors.length &&
        e.errors[0].reason === "invalid"
      ) {
        purchase = await this.validateSubscription(token, sku);
      } else {
        throw e;
      }
    }
    return purchase;
  }

  async serverNotification(notification: any): Promise<PurchaseEvent> {
    const buff = Buffer.from(notification.message.data, "base64");
    const json = buff.toString("utf-8");
    const payload = JSON.parse(json);

    let token;
    let sku;
    if (payload.subscriptionNotification !== undefined) {
      token = payload.subscriptionNotification.purchaseToken;
      sku = payload.subscriptionNotification.subscriptionId;
    } else if (payload.oneTimeProductNotification !== undefined) {
      token = payload.oneTimeProductNotification.purchaseToken;
      sku = payload.oneTimeProductNotification.sku;
    } else {
      throw new Error("Unknown notification type");
    }
    const response = await this.validate(token, sku);
    const parsedReceipt = await this.parseReceipt(response, token, sku, false);

    // Update the purchase date to the event time of the notification
    const receiptDate = new Date(parseInt(payload.eventTimeMillis));
    parsedReceipt.receipt.receiptDate = receiptDate;
    if (payload.subscriptionNotification !== undefined) {
      const dbPurchase = await db.getPurchaseByOrderId(
        parsedReceipt.purchases[0].orderId
      );
      if (!dbPurchase) {
        parsedReceipt.purchases[0].purchaseDate = receiptDate;
        parsedReceipt.purchases[0].receiptDate = receiptDate;
      }
    }

    return this.processParsedReceipt(parsedReceipt);
  }

  async parseReceipt(
    receiptData:
      | androidpublisher_v3.Schema$SubscriptionPurchase
      | androidpublisher_v3.Schema$ProductPurchase,
    token: string,
    sku: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    includeNewer: boolean
  ): Promise<ParsedReceipt> {
    let purchase;
    if (receiptData.kind === "androidpublisher#subscriptionPurchase") {
      purchase = await this.processSubscriptionTransaction(receiptData, sku);
    } else {
      purchase = await this.processPurchaseTransaction(receiptData, sku);
    }

    const receipt: Receipt = {
      platform: "android",
      hash: this.getHash(token),
      receiptDate: purchase.receiptDate,
      token,
      data: receiptData,
    };

    return {
      receipt,
      purchases: [purchase],
    };
  }

  async processPurchaseTransaction(
    transaction: androidpublisher_v3.Schema$ProductPurchase,
    sku: string
  ): Promise<Purchase> {
    const purchaseDate = new Date(parseInt(transaction.purchaseTimeMillis));

    const purchase: Purchase = {
      productId: null,
      receiptId: null,
      isSandbox:
        transaction.purchaseType !== undefined &&
        transaction.purchaseType === 0,
      price: 0,
      currency: "",
      convertedPrice: 0,
      convertedCurrency: "",
      receiptDate: purchaseDate,
      isSubscription: false,
      orderId: transaction.orderId,
      platform: "android",
      productSku: sku,
      productType: "consumable", // @TODO: Non consumable type
      purchaseDate,
      quantity: transaction.quantity,

      // @TODO: Is this info available via https://developer.android.com/google/play/billing/rtdn-reference#one-time?
      // or https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list
      isRefunded: false, // #TODO
      refundDate: null, // @TODO
      refundReason: null, // @TODO
      cancellationReason: null,
      expirationDate: null,
      gracePeriodEndDate: null,
      isIntroOfferPeriod: null,
      isSubscriptionActive: null,
      isSubscriptionGracePeriod: null,
      isSubscriptionPaused: null,
      isSubscriptionRenewable: null,
      isSubscriptionRetryPeriod: null,
      isTrial: null,
      isTrialConversion: null,
      linkedOrderId: null,
      linkedPurchaseId: null,
      linkedToken: null,
      originalOrderId: null,
      originalPurchaseId: null,
      subscriptionGroup: null,
      subscriptionPeriodType: null,
      subscriptionRenewalProductSku: null,
      subscriptionState: null,
      subscriptionStatus: null,
      userId: null,
    };

    const product = await this.getProduct(purchase.productSku, "android");
    if (product) {
      // Google does not include purchase price info with ProductPurchases (ony subscriptions)
      purchase.productId = product.id;
      purchase.price = product.price;
      purchase.convertedPrice = product.price;
      purchase.currency = product.currency;
      purchase.convertedCurrency = product.currency;
    }

    return purchase;
  }

  async processSubscriptionTransaction(
    transaction: androidpublisher_v3.Schema$SubscriptionPurchase,
    sku: string
  ): Promise<Purchase> {
    const purchaseDate = new Date(parseInt(transaction.startTimeMillis));

    // Try to re-create the order ID history if the order has '..' in it
    const orderIdSplit = transaction.orderId.split("..");
    const originalOrderId = orderIdSplit[0];
    let linkedOrderId = null;
    if (orderIdSplit.length > 1) {
      const orderNum = parseInt(orderIdSplit[1]);
      if (orderNum === 0) {
        linkedOrderId = originalOrderId;
      } else {
        linkedOrderId = `${originalOrderId}..${orderNum - 1}`;
      }
    }

    const expirationDate = new Date(parseInt(transaction.expiryTimeMillis));
    const isSubscriptionActive = new Date() < expirationDate;

    const purchase: Purchase = {
      linkedPurchaseId: null,
      originalPurchaseId: null,
      userId: null,
      productId: null, // @TODO
      receiptId: null,
      isSandbox:
        transaction.purchaseType !== undefined &&
        transaction.purchaseType === 0,
      price: 0, // @TODO
      currency: "", // @TODO
      convertedPrice: 0, // @TODO
      convertedCurrency: "", // @TODO
      receiptDate: purchaseDate,
      isSubscription: true,
      orderId: transaction.orderId,
      platform: "android",
      productSku: sku,
      productType: "renewable_subscription",
      purchaseDate,
      quantity: 1,

      // @TODO
      // Refunds are sent via real-time notifications using 'SUBSCRIPTION_REVOKED' notification
      // See https://developer.android.com/google/play/billing/subscriptions#revoke
      // Perhaps also via https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list
      isRefunded: false, // #TODO
      refundDate: null, // @TODO
      refundReason: null, // @TODO

      isTrial: transaction.paymentState === 2,
      isIntroOfferPeriod: transaction.paymentState === 2, // On Android free trial is intro offer period
      isSubscriptionActive,
      isSubscriptionRenewable: transaction.autoRenewing,
      isSubscriptionRetryPeriod:
        !isSubscriptionActive && // the subscription has expired
        transaction.autoRenewing && // but it's renewing
        transaction.paymentState === 0, // and payment hasn't been received
      isSubscriptionGracePeriod:
        isSubscriptionActive && // the subscription hasn't expired
        transaction.autoRenewing && // and it's renewing
        transaction.paymentState === 0, // but payment hasn't been received
      isSubscriptionPaused:
        !isSubscriptionActive && // the subscription has expired
        transaction.autoRenewing && // but it will renew
        transaction.paymentState === 1, // because it's been paid for

      // @TODO - Will need to look up previous transactions in the database to compare
      isTrialConversion: false,

      // Additional Subscription Info
      originalOrderId,
      linkedOrderId,
      subscriptionPeriodType: null,
      subscriptionState: null,
      subscriptionStatus: null,
      subscriptionGroup: null,
      subscriptionRenewalProductSku: null, // @TODO: Probably found via real-time notifications(?)
      cancellationReason: this.getCancellationReason(transaction),
      expirationDate,
      gracePeriodEndDate: null,
      linkedToken: transaction.linkedPurchaseToken,
    };

    const product = await this.getProduct(purchase.productSku, "android");
    if (product) {
      const priceMicros = parseInt(transaction.priceAmountMicros, 10);
      purchase.productId = product.id;
      purchase.convertedPrice = product.price;
      purchase.convertedCurrency = product.currency;
      if (!isNaN(priceMicros)) {
        // Note: we store price in cents
        purchase.price = priceMicros / 10000;
        purchase.currency = transaction.priceCurrencyCode.toUpperCase();
      } else {
        purchase.price = product.price;
        purchase.currency = product.currency;
      }

      if (purchase.currency !== product.currency) {
        try {
          purchase.convertedPrice = await this.getConvertedPrice(
            purchase.price,
            purchase.currency,
            product.currency,
            purchase.purchaseDate
          );
        } catch (e) {
          logger.error(e.message);
          // If conversion fails we just fall back to the product price and currency
        }
      }
    }

    if (purchase.isSubscriptionGracePeriod) {
      purchase.gracePeriodEndDate = expirationDate;
    }

    purchase.subscriptionPeriodType = this.getSubscriptionPeriodType(purchase);
    purchase.subscriptionState = this.getSubscriptionState(purchase);
    purchase.subscriptionStatus = this.getSubscriptionStatus(purchase);

    return purchase;
  }

  getCancellationReason(
    transaction: androidpublisher_v3.Schema$SubscriptionPurchase
  ): CancellationReason {
    let cancellationReason: CancellationReason = null;
    if (transaction.cancelSurveyResult) {
      cancellationReason = "customer_cancelled";
    } else if (transaction.cancelReason == 1) {
      cancellationReason = "billing_error";
    } else if (transaction.cancelReason == 2) {
      cancellationReason = "subscription_replaced";
    } else if (transaction.cancelReason == 3) {
      cancellationReason = "developer_cancelled";
    }
    return cancellationReason;
  }
}
