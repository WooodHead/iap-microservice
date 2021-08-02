import { google, GoogleApis } from "googleapis";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";

import { ParsedReceipt, Purchase, Receipt } from "../types";
import { IAPProvider } from "./IAPProvider";

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

  parseReceipt(
    receiptData:
      | androidpublisher_v3.Schema$SubscriptionPurchase
      | androidpublisher_v3.Schema$ProductPurchase,
    token: string,
    sku: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

      // @TODO: Is this info available via https://developer.android.com/google/play/billing/rtdn-reference#one-time?
      // or https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list
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
      receiptId: null,
      isSandbox:
        transaction.purchaseType !== undefined &&
        transaction.purchaseType === 0,
      receiptDate: purchaseDate,
      isSubscription: true,
      orderId: transaction.orderId,
      platform: "android",
      productSku: sku,
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
        isSubscriptionActive && transaction.autoRenewing,
      isSubscriptionGracePeriod: false,
      isSubscriptionPaused: false,

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
      cancellationReason: null,
      expirationDate,
      gracePeriodEndDate: null,
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

    purchase.isSubscriptionPaused =
      transaction.paymentState == 1 && // payment hast been received
      !purchase.isSubscriptionActive && // and the subscription has expired
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
