import { IAPProvider } from "./IAPProvider";
import {
  CancellationReason,
  ParsedReceipt,
  Purchase,
  Receipt,
  SubscriptionPeriodType,
  SubscriptionState,
  SubscriptionStatus,
} from "../../types";
import { google } from "googleapis";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";
import { AppleInAppPurchaseTransaction } from "types-apple-iap";
import db from "../database";

export class Google extends IAPProvider {
  constructor() {
    super();
  }

  async getClient() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
          /\\n/gm,
          "\n"
        ),
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

  async validate(
    token: string,
    sku: string,
    isSubscription?: boolean
  ): Promise<
    | androidpublisher_v3.Schema$ProductPurchase
    | androidpublisher_v3.Schema$SubscriptionPurchase
  > {
    if (isSubscription) {
      return this.validateSubscription(token, sku);
    } else {
      return this.validatePurchase(token, sku);
    }
  }

  parseReceipt(
    receiptData:
      | androidpublisher_v3.Schema$SubscriptionPurchase
      | androidpublisher_v3.Schema$ProductPurchase,
    token: string,
    sku: string,
    includeNewer: boolean
  ): ParsedReceipt {
    let purchase;
    if (receiptData.kind === "androidpublisher#subscriptionPurchase") {
      purchase = this.processSubscriptionTransaction(receiptData, sku);
    } else {
      purchase = this.processPurchaseTransaction(receiptData, sku);
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

  processPurchaseTransaction(
    transaction: androidpublisher_v3.Schema$ProductPurchase,
    sku: string
  ): Purchase {
    const purchaseDate = new Date(parseInt(transaction.purchaseTimeMillis));
    return {
      receiptId: null,
      isSandbox: transaction.purchaseType && transaction.purchaseType === 0,
      receiptDate: purchaseDate,
      isSubscription: false,
      orderId: transaction.orderId,
      platform: "android",
      productSku: sku,
      purchaseDate,
      quantity: transaction.quantity,
      isRefunded: false, // #TODO
      refundDate: null, // @TODO
      refundReason: null, // @TODO
    };
  }

  processSubscriptionTransaction(
    transaction: androidpublisher_v3.Schema$SubscriptionPurchase,
    sku: string
  ): Purchase {
    const purchaseDate = new Date(parseInt(transaction.startTimeMillis));

    // Try to re-create the order ID history if the order has '..' in it
    // This appears to only be useful in Sandbox
    const orderIdSplit = transaction.orderId.split("..");
    const originalOrderId = orderIdSplit[0];
    let linkedOrderId = null;
    if (orderIdSplit.length > 1) {
      const orderNum = parseInt(orderIdSplit[1]) - 1;
      linkedOrderId = `${originalOrderId}..${orderNum}`;
    }

    const expirationDate = new Date(parseInt(transaction.expiryTimeMillis));
    const isSubscriptionActive = new Date() < expirationDate;

    const purchase: Purchase = {
      receiptId: null,
      isSandbox: transaction.purchaseType && transaction.purchaseType === 0,
      receiptDate: purchaseDate,
      isSubscription: true,
      orderId: transaction.orderId,
      platform: "android",
      productSku: sku,
      purchaseDate,
      quantity: 1,
      isRefunded: false, // #TODO
      refundDate: null, // @TODO
      refundReason: null, // @TODO

      isTrial: transaction.paymentState === 2,
      isIntroOfferPeriod: transaction.paymentState === 2, // On Android free trial is intro offer period
      isSubscriptionActive,
      isSubscriptionRenewable: transaction.autoRenewing,
      isSubscriptionRetryPeriod:
        isSubscriptionActive && transaction.autoRenewing,
      isSubscriptionGracePeriod: false,
      isTrialConversion: false, // @TODO

      // Additional Subscription Info
      originalOrderId,
      linkedOrderId,
      subscriptionPeriodType: null,
      subscriptionState: null,
      subscriptionStatus: null,
      subscriptionGroup: null,
      cancellationReason: null,
      expirationDate,
      gracePeriodEndDate: null, // @TODO
      linkedToken: transaction.linkedPurchaseToken,
    };

    if (transaction.cancelSurveyResult) {
      purchase.cancellationReason = "customer_cancelled";
    } else if (transaction.cancelReason == 1) {
      purchase.cancellationReason = "billing_error";
    } else if (transaction.cancelReason == 2) {
      purchase.cancellationReason = "subscription_replaced";
    } else if (transaction.cancelReason == 3) {
      purchase.cancellationReason = "developer_cancelled";
    }

    purchase.isSubscriptionGracePeriod =
      transaction.paymentState == 0 && // payment hasn't been received
      purchase.isSubscriptionActive && // and the subscription hasn't expired
      purchase.isSubscriptionRenewable; // and it's renewing

    if (purchase.isSubscriptionGracePeriod) {
      purchase.gracePeriodEndDate = expirationDate;
    }

    purchase.subscriptionPeriodType = this.getSubscriptionPeriodType(purchase);
    purchase.subscriptionState = this.getSubscriptionState(purchase);
    purchase.subscriptionStatus = this.getSubscriptionStatus(purchase);

    return purchase;
  }
}
