import fetch from "node-fetch";
import {
  AppleInAppPurchaseTransaction,
  AppleLatestReceiptInfo,
  ApplePendingRenewalInfo,
  AppleVerifyReceiptErrorCode,
  AppleVerifyReceiptResponseBody,
  AppleVerifyReceiptResponseBodySuccess,
  AppleVerifyReceiptSuccessfulStatus,
} from "types-apple-iap";

import { CancellationReason, ParsedReceipt, Purchase, Receipt } from "../types";
import { IAPProvider } from "./IAPProvider";

const ENDPOINT_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";
const ENDPOINT_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt";

export default class Apple extends IAPProvider {
  sharedSecret = "";

  constructor(sharedSecret: string) {
    super();
    this.sharedSecret = sharedSecret;
  }

  async validateUsingEnvironment(
    token: string,
    sandbox: boolean
  ): Promise<AppleVerifyReceiptResponseBody> {
    const content: any = {
      "receipt-data": token,
      password: this.sharedSecret,
    };

    const endpoint = sandbox ? ENDPOINT_SANDBOX : ENDPOINT_PRODUCTION;

    const result = await fetch(endpoint, {
      method: "post",
      body: JSON.stringify(content),
      headers: { "Content-Type": "application/json" },
    });
    const receiptResponse: AppleVerifyReceiptResponseBody = await result.json();

    if (
      receiptResponse.status === AppleVerifyReceiptSuccessfulStatus.SUCCESS ||
      receiptResponse.status ===
        AppleVerifyReceiptSuccessfulStatus.VALID_BUT_SUBSCRIPTION_EXPIRED
    ) {
      return receiptResponse;
    } else if (
      receiptResponse.status ===
      AppleVerifyReceiptErrorCode.USE_TEST_ENVIRONMENT
    ) {
      return this.validateUsingEnvironment(token, true);
    } else {
      throw Apple.handleError(receiptResponse.status);
    }
  }

  /**
   * Validate an Apple IAP receipt
   * Attempts to validate against Apple Prod environment first,
   * but will also attempt Sandbox if directed to by the prod environment
   *
   * @param token Base64 encoded receipt from StoreKit
   * @param sku Product SKU - (not used/Android only)
   * @return Receipt Object from Apple if the receipt is valid
   * @throws AppleError if receipt or shared password are invalid. HTTP Error if one occurred.
   */
  async validate(
    token: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sku: string
  ): Promise<AppleVerifyReceiptResponseBodySuccess> {
    return (await this.validateUsingEnvironment(
      token,
      false
    )) as AppleVerifyReceiptResponseBodySuccess;
  }

  parseReceipt(
    receiptData: AppleVerifyReceiptResponseBodySuccess,
    token: string,
    sku: string,
    includeNewer: boolean
  ): ParsedReceipt {
    // The receipt contains both receipt.in_app and latest_receipt_info arrays
    // The most recent item in receipt.in_app is the actual transaction that
    // triggered the receipt, but if there are subscriptions associated with
    // the user then some (but not all?) subscription transactions can appear
    // in here is well.
    // latest_receipt_info will contain the full list of subscription transactions
    // up-to-date at the time the receipt is validated.

    const isSandbox = this.isSandbox(receiptData);
    const receiptDate = new Date(
      parseInt(receiptData.receipt.receipt_creation_date_ms)
    );

    const receipt: Receipt = {
      platform: "ios",
      hash: this.getHash(token),
      receiptDate,
      token,
      data: receiptData,
    };

    const transactions = this.mergeTransactions(
      receiptData.receipt.in_app,
      receiptData.latest_receipt_info || [],
      includeNewer
    );

    const purchases: Purchase[] = [];

    for (const transaction of transactions) {
      if (!this.isSubscription(transaction)) {
        purchases.push(
          this.processPurchaseTransaction(transaction, receiptDate, isSandbox)
        );
      } else {
        purchases.push(
          this.processSubscriptionTransaction(transaction, receiptData)
        );
      }
    }
    return {
      receipt,
      purchases,
    };
  }

  processPurchaseTransaction(
    transaction: AppleInAppPurchaseTransaction,
    receiptDate: Date,
    isSandbox: boolean
  ): Purchase {
    const purchase: Purchase = {
      receiptId: null,
      isRefunded: !!transaction.cancellation_date_ms,
      isSandbox,
      receiptDate,
      isSubscription: !!transaction.expires_date,
      orderId: transaction.transaction_id,
      platform: "ios",
      productSku: transaction.product_id,
      purchaseDate: new Date(parseInt(transaction.purchase_date_ms)),
      quantity: parseInt(transaction.quantity),
      refundDate: null,
      refundReason: null,
    };

    if (purchase.isRefunded) {
      if (transaction.cancellation_reason === "1") {
        purchase.refundReason = "issue";
      } else if (transaction.cancellation_reason === "0") {
        purchase.refundReason = "other";
      }
    }
    if (transaction.cancellation_date_ms) {
      purchase.refundDate = new Date(
        parseInt(transaction.cancellation_date_ms)
      );
    }
    return purchase;
  }

  processSubscriptionTransaction(
    transaction: AppleInAppPurchaseTransaction,
    receipt: AppleVerifyReceiptResponseBodySuccess
  ): Purchase {
    const isSandbox = this.isSandbox(receipt);
    const receiptDate = new Date(
      parseInt(receipt.receipt.receipt_creation_date_ms)
    );
    const purchase = this.processPurchaseTransaction(
      transaction,
      receiptDate,
      isSandbox
    );

    const renewalInfo = receipt.pending_renewal_info?.find((item) => {
      return (
        item.original_transaction_id === transaction.original_transaction_id &&
        item.product_id === transaction.product_id
      );
    });

    const sortedLatestInfo = [...receipt.latest_receipt_info].sort(
      Apple.sortTransactionsDesc
    );

    const priorTransactions = sortedLatestInfo.filter((item) => {
      return (
        item.original_transaction_id === transaction.original_transaction_id &&
        parseInt(item.purchase_date_ms) <=
          parseInt(transaction.purchase_date_ms)
      );
    });

    const originalOrder = this.getOriginalOrder(transaction, priorTransactions);
    const linkedOrder =
      priorTransactions.length > 1 ? priorTransactions[1] : null;

    // For subscriptions we use the 'web_order_line_item_id' instead of 'transaction_id'
    // to identify a Purchase
    purchase.orderId = transaction.web_order_line_item_id;
    purchase.originalOrderId = originalOrder.web_order_line_item_id;
    purchase.linkedOrderId = linkedOrder
      ? linkedOrder.web_order_line_item_id
      : null;
    purchase.expirationDate = new Date(parseInt(transaction.expires_date_ms));
    purchase.isSubscriptionActive = false;
    purchase.isTrialConversion = false;
    purchase.isTrial = transaction.is_trial_period === "true";
    purchase.isIntroOfferPeriod =
      transaction.is_in_intro_offer_period === "true";
    purchase.isSubscriptionRenewable =
      renewalInfo?.auto_renew_status === "1" || false;
    purchase.isSubscriptionRetryPeriod =
      renewalInfo?.is_in_billing_retry_period === "1" || false;
    purchase.isSubscriptionGracePeriod = false;
    purchase.isSubscriptionPaused = false; // Not supported by Apple
    purchase.subscriptionRenewalProductSku =
      renewalInfo?.auto_renew_product_id || null;

    if (originalOrder.subscription_group_identifier) {
      purchase.subscriptionGroup = originalOrder.subscription_group_identifier;
    }

    // Purchase a trial conversion if this one is not a trial, but the one before it is
    if (!purchase.isTrial && priorTransactions.length > 1) {
      purchase.isTrialConversion =
        priorTransactions[1].is_trial_period === "true";
    }

    // Subscription is active if the expiration date is in future, or if Grace Period is set and is still in future
    if (!purchase.isRefunded) {
      const now = new Date();
      if (now < purchase.expirationDate) {
        purchase.isSubscriptionActive = true;
      } else if (renewalInfo && renewalInfo.grace_period_expires_date_ms) {
        purchase.gracePeriodEndDate = new Date(
          parseInt(renewalInfo.grace_period_expires_date_ms)
        );

        if (now < purchase.gracePeriodEndDate) {
          purchase.isSubscriptionActive = true;
          purchase.isSubscriptionGracePeriod = true;
        }
      }
    }

    // Subscription Period Type
    purchase.subscriptionPeriodType = this.getSubscriptionPeriodType(purchase);

    // Cancellation Reason
    purchase.cancellationReason = this.getCancellationReason(
      purchase,
      renewalInfo
    );

    purchase.subscriptionState = this.getSubscriptionState(purchase);
    purchase.subscriptionStatus = this.getSubscriptionStatus(purchase);

    return purchase;
  }

  isSandbox(receipt: AppleVerifyReceiptResponseBodySuccess): boolean {
    return receipt.environment === "Sandbox";
  }

  isSubscription(
    transaction: AppleInAppPurchaseTransaction | AppleLatestReceiptInfo
  ): boolean {
    return !!transaction.expires_date;
  }

  getOriginalOrder(
    transaction: AppleInAppPurchaseTransaction,
    otherTransactions: AppleLatestReceiptInfo[]
  ): AppleLatestReceiptInfo {
    return otherTransactions.find((item) => {
      return item.transaction_id === transaction.original_transaction_id;
    });
  }

  // See https://developer.apple.com/documentation/appstorereceipts/expiration_intent
  getCancellationReason(
    purchase: Purchase,
    renewalInfo?: ApplePendingRenewalInfo
  ): CancellationReason {
    let cancellationReason: CancellationReason;
    if (purchase.isRefunded) {
      cancellationReason = "refunded";
    } else if (renewalInfo && renewalInfo.expiration_intent === "1") {
      cancellationReason = "customer_cancelled";
    } else if (
      !purchase.isSubscriptionActive &&
      !purchase.isSubscriptionRetryPeriod &&
      renewalInfo &&
      renewalInfo.expiration_intent === "2"
    ) {
      cancellationReason = "billing_error";
    } else if (
      !purchase.isSubscriptionActive &&
      renewalInfo &&
      renewalInfo.expiration_intent === "3"
    ) {
      cancellationReason = "rejected_price_increase";
    } else if (
      !purchase.isSubscriptionActive &&
      renewalInfo &&
      renewalInfo.expiration_intent === "4"
    ) {
      cancellationReason = "product_not_available";
    } else if (
      !purchase.isSubscriptionActive &&
      renewalInfo &&
      renewalInfo.expiration_intent === "5"
    ) {
      cancellationReason = "unknown";
    }

    return cancellationReason;
  }

  /**
   * Merge the in_app and latest_receipt_info arrays together into a single array
   * of unique transactions. If a transaction exists in both arrays, the version
   * inside in_app is kept
   * @param inAppTransactions
   * @param latestReceiptInfo
   * @param includeNewer - Include transactions from latest_receipt_info that are newer than the latest in_app purchase
   */
  mergeTransactions(
    inAppTransactions: AppleInAppPurchaseTransaction[],
    latestReceiptInfo: AppleLatestReceiptInfo[],
    includeNewer: boolean
  ): AppleInAppPurchaseTransaction[] {
    inAppTransactions.sort(Apple.sortTransactionsDesc);
    const inAppIds = inAppTransactions.map((item) => item.transaction_id);
    let orphaned = latestReceiptInfo.filter((item) => {
      return inAppIds.indexOf(item.transaction_id) === -1;
    });

    if (!includeNewer) {
      orphaned = orphaned.filter((item) => {
        return (
          parseInt(item.purchase_date_ms) <
          parseInt(inAppTransactions[0].purchase_date_ms)
        );
      });
    }

    return inAppTransactions.concat(orphaned).sort(Apple.sortTransactionsDesc);
  }

  static sortTransactionsDesc(
    a: AppleInAppPurchaseTransaction | AppleLatestReceiptInfo,
    b: AppleInAppPurchaseTransaction | AppleLatestReceiptInfo
  ): number {
    return parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms);
  }

  private static handleError(code: number): Error {
    switch (code) {
      case AppleVerifyReceiptErrorCode.NOT_POST:
        return new AppleError(
          "Error should not happen. Apple expects a correctly formatted HTTP POST which, we perform on your behalf.",
          code
        );
      case AppleVerifyReceiptErrorCode.SHOULD_NOT_HAPPEN:
        return new AppleError(
          "Apple's documentation says this response code is no longer being used. Should not happen.",
          code
        );
      case AppleVerifyReceiptErrorCode.INVALID_RECEIPT_OR_DOWN:
        return new AppleError(
          "The receipt you sent may be malformed. Your code may have modified the receipt or this is a bad request sent by someone possibly malicious. Make sure your apps work and besides that, ignore this.",
          code
        );
      case AppleVerifyReceiptErrorCode.UNAUTHORIZED:
        return new AppleError(
          "Apple said the request was unauthorized. Perhaps you provided the wrong shared secret?",
          code
        );
      case AppleVerifyReceiptErrorCode.WRONG_SHARED_SECRET:
        return new AppleError(
          "Apple said the shared secret that you provided does not match the shared secret on file for your account. Check it to make sure it's correct.",
          code
        );
      case AppleVerifyReceiptErrorCode.APPLE_INTERNAL_ERROR:
      case AppleVerifyReceiptErrorCode.SERVICE_DOWN: {
        return new AppleError(
          "Sorry! Apple's service seems to be down. Try the request again later. That's all we know.",
          code
        );
      }
      case AppleVerifyReceiptErrorCode.CUSTOMER_NOT_FOUND:
        return new AppleError(
          "Apple could not find the customer. The customer could have been deleted?",
          code
        );
    }
  }
}

export class AppleError extends Error {
  constructor(
    message: string,
    public appleErrorCode: AppleVerifyReceiptErrorCode
  ) {
    super(`${message} (error code: ${appleErrorCode})`);
  }
}
