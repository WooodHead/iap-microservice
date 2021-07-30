import each from "jest-each";

import { Purchase } from "../../types";
import { IAPProvider } from "./IAPProvider";

describe("IAPProvider Tests", () => {
  const iapProvider = new IAPProvider();

  each([
    [{ isTrial: false, isIntroOfferPeriod: false }, "normal"],
    [{ isTrial: true, isIntroOfferPeriod: false }, "trial"],
    [{ isTrial: false, isIntroOfferPeriod: true }, "intro"],
  ]).test("getSubscriptionPeriodType %s %s", (purchase, expected) => {
    expect(iapProvider.getSubscriptionPeriodType(purchase)).toEqual(expected);
  });

  each([
    [
      {
        isSubscriptionActive: true,
        isSubscriptionGracePeriod: false,
        isSubscriptionRetryPeriod: false,
      },
      "active",
    ],
    [
      {
        isSubscriptionActive: false,
        isSubscriptionGracePeriod: true,
        isSubscriptionRetryPeriod: false,
      },
      "grace_period",
    ],
    [
      {
        isSubscriptionActive: false,
        isSubscriptionGracePeriod: false,
        isSubscriptionRetryPeriod: true,
      },
      "retry_period",
    ],
    [
      {
        isSubscriptionActive: false,
        isSubscriptionGracePeriod: false,
        isSubscriptionRetryPeriod: false,
      },
      "expired",
    ],
  ]).test("getSubscriptionState %s %s", (purchase, expected) => {
    expect(iapProvider.getSubscriptionState(purchase)).toEqual(expected);
  });

  test("Cancelled trial subscription is immediately expired", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      subscriptionPeriodType: "trial",
      isSubscriptionActive: true,
      isSubscriptionRenewable: false,
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("expired");
  });

  test("Active trial subscription is not expired", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      subscriptionPeriodType: "trial",
      isSubscriptionRenewable: true,
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("trial");
  });

  test("Refunded subscription", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isRefunded: true,
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("refunded");
  });

  test("Subscription in Grace Period", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionGracePeriod: true,
      isSubscriptionRetryPeriod: true,
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("grace_period");
  });

  test("Subscription in Retry Period", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionGracePeriod: false,
      isSubscriptionRetryPeriod: true,
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("retry_period");
  });

  test("Cancelled and Not Active subscription is Expired", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionActive: false,
      isSubscriptionRenewable: false,
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("expired");
  });

  test("Cancelled active subscription before expiry date", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionActive: true,
      isSubscriptionRenewable: false,
      expirationDate: new Date(new Date().getTime() + 5000), // Expire in the future
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("cancelled");
  });

  test("Cancelled active subscription after expiry date", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionActive: true,
      isSubscriptionRenewable: false,
      expirationDate: new Date(new Date().getTime() - 5000), // Expire in the past
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("expired");
  });

  test("Subscription is paused", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      subscriptionState: "paused",
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("paused");
  });

  test("Subscription is active", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionActive: true,
      isSubscriptionRenewable: true,
      subscriptionState: "active",
    };
    const status = iapProvider.getSubscriptionStatus(purchase);
    expect(status).toBe("active");
  });
});
