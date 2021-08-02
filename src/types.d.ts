import { androidpublisher_v3 } from "googleapis/build/src/apis/androidpublisher/v3";
import { AppleVerifyReceiptResponseBody } from "types-apple-iap";

export type Platform = "android" | "ios";

export type CancellationReason =
  | "refunded"
  | "customer_cancelled"
  | "developer_cancelled"
  | "subscription_replaced"
  | "rejected_price_increase"
  | "billing_error"
  | "product_not_available"
  | "unknown";

export type SubscriptionPeriodType = "intro" | "normal" | "trial";

export type SubscriptionState =
  | "active"
  | "expired"
  | "grace_period"
  | "retry_period"
  | "paused";

export type SubscriptionStatus =
  | "unknown"
  | "active"
  | "expired"
  | "cancelled"
  | "refunded"
  | "trial"
  | "grace_period"
  | "retry_period"
  | "paused";

export type Purchase = {
  id?: string;
  linkedPurchaseId?: string;
  originalPurchaseId?: string;
  receiptId: string;

  userId?: string; // Arbitrary ID provided by user
  // Generic Order Properties
  isSandbox: boolean;
  isRefunded: boolean;
  quantity: number;
  platform: Platform;
  orderId?: string;
  productSku: string;
  purchaseDate: Date;
  receiptDate: Date;
  refundDate: Date | null;
  refundReason: "issue" | "subscription_replace" | "other" | null;

  // Subscription Flags
  isSubscription: boolean;
  isTrial?: boolean;
  isIntroOfferPeriod?: boolean;
  isSubscriptionActive?: boolean;
  isSubscriptionRenewable?: boolean;
  isSubscriptionRetryPeriod?: boolean;
  isSubscriptionGracePeriod?: boolean;
  isTrialConversion?: boolean;

  // Additional Subscription Info
  originalOrderId?: string;
  linkedOrderId?: string;
  subscriptionPeriodType?: SubscriptionPeriodType;
  subscriptionState?: SubscriptionState;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionGroup?: string;
  cancellationReason?: CancellationReason;
  expirationDate?: Date;
  gracePeriodEndDate?: Date;
  token?: string;
  linkedToken?: string; // Android only

  /*
  // Are these needed?
  subscriptionRenewalProductSku?: string;
   */
};

export type Receipt = {
  id?: string;
  hash: string;
  userId?: string; // Arbitrary ID provided by user
  platform: Platform;
  token: string;
  data:
    | AppleVerifyReceiptResponseBody
    | androidpublisher_v3.Schema$ProductPurchase
    | androidpublisher_v3.Schema$SubscriptionPurchase
    | any;
  receiptDate: Date;
};

export type ParsedReceipt = {
  receipt: Receipt;
  purchases: Purchase[];
};
