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
  // Generic Order Properties
  isSandbox: boolean;
  isRefunded: boolean;
  quantity: number;
  platform: "android" | "ios";
  orderId: string;
  productSku: string;
  purchaseDate: Date;
  refundDate?: Date;
  refundReason?: "issue" | "subscription_replace" | "other";

  // Subscription Flags
  isTrial?: boolean;
  isIntroOfferPeriod?: boolean;
  isSubscription: boolean;
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
  userAccountId: string; // References UserAccount.id
  linkedPurchaseId?: string; // Previous Purchase ID
  originalPurchaseId?: string; // Previous Purchase ID
  subscriptionId?: string; // If this was for a subscription, the ID of that subscription
  iaphubListingId: string;
  iaphubUserId: string;
  iaphubReceiptId: string;
  iaphubPurchaseId: string;
  iaphubOriginalPurchaseId?: string;
  iaphubLinkedPurchaseId?: string;
  iaphubProductId: string;
  iaphubStoreId: string;
  productType: IAPHubProductType;
  productGroupName?: string;
  currency: string;
  price: number;
  convertedCurrency: string;
  convertedPrice: number;
  refundAmount?: number;
  convertedRefundAmount?: number;
  subscriptionRenewalProduct?: string; // Product ID of next renewal
  subscriptionRenewalProductSku?: string;

   */
};
