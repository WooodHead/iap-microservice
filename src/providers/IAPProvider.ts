import crypto from "crypto";
import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";
import fetch from "node-fetch";
import {
  AppleVerifyReceiptResponseBody,
  AppleVerifyReceiptResponseBodySuccess,
} from "types-apple-iap";

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
      | AppleVerifyReceiptResponseBodySuccess
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
