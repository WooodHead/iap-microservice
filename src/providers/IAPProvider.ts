import crypto from "crypto";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";
import {
  AppleVerifyReceiptResponseBody,
  AppleVerifyReceiptResponseBodySuccess,
} from "types-apple-iap";

import {
  ParsedReceipt,
  Purchase,
  SubscriptionPeriodType,
  SubscriptionState,
  SubscriptionStatus,
} from "../../types";

export class IAPProvider {
  validate(
    token: string,
    sku: string,
    isSubscription?: boolean
  ): Promise<
    | AppleVerifyReceiptResponseBody
    | androidpublisher_v3.Schema$ProductPurchase
    | androidpublisher_v3.Schema$SubscriptionPurchase
  > {
    throw Error("Not implemented!");
  }

  parseReceipt(
    receipt:
      | AppleVerifyReceiptResponseBodySuccess
      | androidpublisher_v3.Schema$ProductPurchase
      | androidpublisher_v3.Schema$SubscriptionPurchase,
    token: string,
    sku: string,
    includeNewer: boolean
  ): ParsedReceipt {
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

  getHash(token: string) {
    return crypto.createHash("md5").update(token).digest("hex");
  }
}
