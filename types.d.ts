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

export type Purchase = {
  id?: number;
  linkedPurchaseId?: number;
  originalPurchaseId?: number;
  userId?: string; // Arbitrary ID provided by user

  // Generic Order Properties
  isSandbox: boolean;
  isRefunded: boolean;
  quantity: number;
  platform: "android" | "ios";
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
  subscriptionPeriodType?: SubscriptionPeriodType;
  subscriptionState?: SubscriptionState;
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
