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

import {
  CancellationReason,
  Purchase,
  SubscriptionPeriodType,
  SubscriptionState,
} from "../../types";
import { IAPProvider } from "./IAPProvider";

const ENDPOINT_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";
const ENDPOINT_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt";

export default class Apple implements IAPProvider {
  sharedSecret = "";

  constructor(sharedSecret: string) {
    this.sharedSecret = sharedSecret;
  }

  /**
   * Validate an Apple IAP receipt
   * Attempts to validate against Apple Prod environment first,
   * but will also attempt Sandbox if directed to by the prod environment
   *
   * @param token Base64 encoded receipt from StoreKit
   * @param sandbox Boolean (optional). Should IAP Sandbox environment be used?
   * @return Raw Receipt Response from Apple if the receipt is valid
   * @throws AppleError if receipt or shared password are invalid. HTTP Error if one occurred.
   */
  async validate(
    token: string,
    sandbox?: boolean
  ): Promise<AppleVerifyReceiptResponseBodySuccess> {
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
      return receiptResponse as AppleVerifyReceiptResponseBodySuccess;
    } else if (
      receiptResponse.status ===
      AppleVerifyReceiptErrorCode.USE_TEST_ENVIRONMENT
    ) {
      return this.validate(token, true);
    } else {
      throw Apple.handleError(receiptResponse.status);
    }
  }

  processPurchase(
    receipt: AppleVerifyReceiptResponseBodySuccess,
    token: string
  ): Purchase {
    const transactions = Apple.getTransactions(receipt);
    const latestTransaction = transactions[0];

    const purchase: Purchase = {
      isRefunded: !!latestTransaction.cancellation_date_ms,
      isSandbox: receipt.environment === "Sandbox",
      isSubscription: !!latestTransaction.expires_date,
      orderId: latestTransaction.transaction_id,
      platform: "ios",
      productSku: latestTransaction.product_id,
      purchaseDate: new Date(parseInt(latestTransaction.purchase_date_ms)),
      quantity: parseInt(latestTransaction.quantity),
      token: receipt.latest_receipt || token,
    };

    if (purchase.isRefunded) {
      if (latestTransaction.cancellation_reason === "1") {
        purchase.refundReason = "issue";
      } else if (latestTransaction.cancellation_reason === "0") {
        purchase.refundReason = "other";
      }
    }
    if (latestTransaction.cancellation_date_ms) {
      purchase.refundDate = new Date(
        parseInt(latestTransaction.cancellation_date_ms)
      );
    }

    if (purchase.isSubscription) {
      return this.processSubscriptionPurchase(purchase, receipt);
    }

    return purchase;
  }

  processSubscriptionPurchase(
    purchase: Purchase,
    receipt: AppleVerifyReceiptResponseBodySuccess
  ): Purchase {
    const renewalInfo = receipt.pending_renewal_info?.find(
      (item) => item.original_transaction_id === purchase.originalOrderId
    );
    const transactions = Apple.getTransactions(receipt).filter(
      (trans) => !!trans.expires_date_ms
    );
    const latestTransaction = transactions[0];

    purchase.originalOrderId = latestTransaction.original_transaction_id;
    purchase.expirationDate = new Date(
      parseInt(latestTransaction.expires_date_ms)
    );
    purchase.isSubscriptionActive = false;
    purchase.isTrialConversion = false;
    purchase.isTrial = latestTransaction.is_trial_period === "true";
    purchase.isIntroOfferPeriod =
      latestTransaction.is_in_intro_offer_period === "true";
    purchase.isSubscriptionRenewable =
      renewalInfo?.auto_renew_status === "1" || false;
    purchase.isSubscriptionRetryPeriod =
      renewalInfo?.is_in_billing_retry_period === "1" || false;
    purchase.isSubscriptionGracePeriod = false;

    // Purchase a trial conversion if this one is not a trial, but the one before it is
    if (!purchase.isTrial && transactions.length > 1) {
      purchase.isTrialConversion = transactions[1].is_trial_period === "true";
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

    return purchase;
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

  static getTransactions(
    receipt: AppleVerifyReceiptResponseBodySuccess
  ): (AppleInAppPurchaseTransaction | AppleLatestReceiptInfo)[] {
    return (receipt.latest_receipt_info || [])
      .concat(receipt.receipt?.in_app || [])
      .sort((a, b) => {
        return parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms);
      });
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