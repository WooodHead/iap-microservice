import "jest-fetch-mock";

import each from "jest-each";
import {
  AppleVerifyReceiptErrorCode,
  AppleVerifyReceiptResponseBodySuccess,
  AppleVerifyReceiptSuccessfulStatus,
} from "types-apple-iap";

import Apple from "./Apple";

describe("Apple Validate tests", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });
  // Test all error codes
  each([
    [AppleVerifyReceiptErrorCode.NOT_POST],
    [AppleVerifyReceiptErrorCode.SHOULD_NOT_HAPPEN],
    [AppleVerifyReceiptErrorCode.INVALID_RECEIPT_OR_DOWN],
    [AppleVerifyReceiptErrorCode.UNAUTHORIZED],
    [AppleVerifyReceiptErrorCode.WRONG_SHARED_SECRET],
    [AppleVerifyReceiptErrorCode.APPLE_INTERNAL_ERROR],
    [AppleVerifyReceiptErrorCode.SERVICE_DOWN],
    [AppleVerifyReceiptErrorCode.CUSTOMER_NOT_FOUND],
  ]).test("Handles Apple Error Code %s", async (code) => {
    expect.assertions(1);
    fetchMock.mockResponseOnce(
      JSON.stringify({
        status: code,
      })
    );

    const apple = new Apple("secret");
    try {
      await apple.validate("token");
    } catch (e) {
      expect(e.message).toContain(`error code: ${code}`);
    }
  });

  // Test redirect to Sandbox
  it("Redirects from Prod to Sandbox environment", async () => {
    expect.assertions(4);
    fetchMock.mockResponse((req) => {
      if (req.url.indexOf("sandbox") > -1) {
        return Promise.resolve(
          JSON.stringify({
            status: AppleVerifyReceiptSuccessfulStatus.SUCCESS,
            receipt: true,
          })
        );
      } else {
        return Promise.resolve(
          JSON.stringify({
            status: AppleVerifyReceiptErrorCode.USE_TEST_ENVIRONMENT,
            receipt: false,
          })
        );
      }
    });

    const apple = new Apple("secret");
    const result = await apple.validate("token");

    expect(fetchMock.mock.calls.length).toEqual(2);
    expect(fetchMock.mock.calls[0][0]).toContain("buy");
    expect(fetchMock.mock.calls[1][0]).toContain("sandbox");
    expect(result.receipt).toBe(true);
  });

  // Test successful statuses
  each([
    [AppleVerifyReceiptSuccessfulStatus.SUCCESS],
    [AppleVerifyReceiptSuccessfulStatus.VALID_BUT_SUBSCRIPTION_EXPIRED],
  ]).test("Handles Apple Success Code %s", async (code) => {
    expect.assertions(3);
    fetchMock.mockResponseOnce(
      JSON.stringify({
        status: code,
        receipt: true,
      })
    );

    const apple = new Apple("secret");
    const result = await apple.validate("token");

    expect(fetchMock.mock.calls.length).toEqual(1);
    expect(fetchMock.mock.calls[0][0]).toContain("buy");
    expect(result.receipt).toBe(true);
  });
});

describe("Helper function tests", () => {
  it("Gets transactions sorted descending", () => {
    const receipt = {
      latest_receipt_info: [
        { purchase_date_ms: "1000" },
        { purchase_date_ms: "3000" },
      ],
      receipt: { in_app: [{ purchase_date_ms: "2000" }] },
    };

    const result = Apple.getTransactions(
      receipt as any as AppleVerifyReceiptResponseBodySuccess
    );

    expect(result).toEqual([
      {
        purchase_date_ms: "3000",
      },
      {
        purchase_date_ms: "2000",
      },
      {
        purchase_date_ms: "1000",
      },
    ]);
  });

  each([
    [{ isTrial: false, isIntroOfferPeriod: false }, "normal"],
    [{ isTrial: true, isIntroOfferPeriod: false }, "trial"],
    [{ isTrial: false, isIntroOfferPeriod: true }, "intro"],
  ]).test("getSubscriptionPeriodType", (purchase, expected) => {
    const apple = new Apple("");
    expect(apple.getSubscriptionPeriodType(purchase)).toEqual(expected);
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
  ]).test("getSubscriptionState", (purchase, expected) => {
    const apple = new Apple("");
    expect(apple.getSubscriptionState(purchase)).toEqual(expected);
  });

  each([
    [{ isRefunded: true }, null, "refunded"],
    [{ isRefunded: false }, { expiration_intent: "1" }, "customer_cancelled"],
    [
      {
        isRefunded: false,
        isSubscriptionActive: false,
        isSubscriptionRetryPeriod: false,
      },
      { expiration_intent: "2" },
      "billing_error",
    ],
    [
      {
        isRefunded: false,
        isSubscriptionActive: false,
        isSubscriptionRetryPeriod: true,
      },
      { expiration_intent: "3" },
      "rejected_price_increase",
    ],
    [
      {
        isRefunded: false,
        isSubscriptionActive: false,
        isSubscriptionRetryPeriod: true,
      },
      { expiration_intent: "4" },
      "product_not_available",
    ],
    [
      {
        isRefunded: false,
        isSubscriptionActive: false,
        isSubscriptionRetryPeriod: true,
      },
      { expiration_intent: "5" },
      "unknown",
    ],
    [
      {
        isRefunded: false,
        isSubscriptionActive: true,
      },
      null,
      undefined,
    ],
  ]).test("getSubscriptionPeriodType", (purchase, renewalInfo, expected) => {
    const apple = new Apple("");
    expect(apple.getCancellationReason(purchase, renewalInfo)).toEqual(
      expected
    );
  });
});

describe("Process Purchase Tests", () => {
  const apple = new Apple("");
  jest
    .spyOn(apple, "processSubscriptionPurchase")
    .mockImplementation((purchase) => purchase);

  each([
    ["1000000", true],
    [undefined, false],
  ]).test(
    "Test isRefunded - cancellation_date_ms %s == %s",
    (cancellation_date_ms, expected) => {
      const receipt: any = {
        receipt: {
          in_app: [
            {
              cancellation_date_ms,
            },
          ],
        },
      };

      const purchase = apple.processPurchase(receipt, "token");
      expect(purchase.isRefunded).toEqual(expected);
    }
  );

  each([
    ["Sandbox", true],
    ["Production", false],
  ]).test("Test isSandbox - environment %s == %s", (environment, expected) => {
    const receipt: any = {
      environment,
      receipt: {
        in_app: [{}],
      },
    };

    const purchase = apple.processPurchase(receipt, "token");
    expect(purchase.isSandbox).toEqual(expected);
  });

  each([
    ["1000000", true],
    [undefined, false],
  ]).test(
    "Test isSubscription - expires_date %s == %s",
    (expires_date, expected) => {
      const receipt: any = {
        receipt: {
          in_app: [
            {
              expires_date,
            },
          ],
        },
      };

      const purchase = apple.processPurchase(receipt, "token");
      expect(purchase.isSubscription).toEqual(expected);
    }
  );

  each([
    ["1", "issue"],
    ["0", "other"],
  ]).test(
    "Test refundReason - cancellation_reason %s == %s",
    (cancellation_reason, expected) => {
      const receipt: any = {
        receipt: {
          in_app: [
            {
              cancellation_date_ms: "10000",
              cancellation_reason,
            },
          ],
        },
      };

      const purchase = apple.processPurchase(receipt, "token");
      expect(purchase.refundReason).toEqual(expected);
    }
  );
});

describe("Process Subscription Tests", () => {
  const apple = new Apple("");
  each([
    ["true", true],
    ["false", false],
  ]).test(
    "Test isTrial - is_trial_period %s == %s",
    (is_trial_period, expected) => {
      const receipt: any = {
        latest_receipt_info: [
          {
            expires_date_ms: "10000",
            is_trial_period,
          },
        ],
      };

      const purchase = apple.processSubscriptionPurchase({} as any, receipt);
      expect(purchase.isTrial).toEqual(expected);
    }
  );

  each([
    ["true", true],
    ["false", false],
  ]).test(
    "Test isIntroOfferPeriod - is_in_intro_offer_period %s == %s",
    (is_in_intro_offer_period, expected) => {
      const receipt: any = {
        latest_receipt_info: [
          {
            expires_date_ms: "10000",
            is_in_intro_offer_period,
          },
        ],
      };

      const purchase = apple.processSubscriptionPurchase({} as any, receipt);
      expect(purchase.isIntroOfferPeriod).toEqual(expected);
    }
  );

  each([
    ["1", true],
    [undefined, false],
  ]).test(
    "Test isSubscriptionRenewable - auto_renew_status %s == %s",
    (auto_renew_status, expected) => {
      const receipt: any = {
        latest_receipt_info: [
          {
            expires_date_ms: "10000",
          },
        ],
        pending_renewal_info: [
          {
            auto_renew_status,
          },
        ],
      };

      const purchase = apple.processSubscriptionPurchase({} as any, receipt);
      expect(purchase.isSubscriptionRenewable).toEqual(expected);
    }
  );

  each([
    ["1", true],
    [undefined, false],
  ]).test(
    "Test isSubscriptionRetryPeriod - is_in_billing_retry_period %s == %s",
    (is_in_billing_retry_period, expected) => {
      const receipt: any = {
        latest_receipt_info: [
          {
            expires_date_ms: "10000",
          },
        ],
        pending_renewal_info: [
          {
            is_in_billing_retry_period,
          },
        ],
      };

      const purchase = apple.processSubscriptionPurchase({} as any, receipt);
      expect(purchase.isSubscriptionRetryPeriod).toEqual(expected);
    }
  );

  it("Test isTrialConversion", () => {
    const receipt: any = {
      latest_receipt_info: [
        {
          // I am the newest receipt
          purchase_date_ms: "1600000001",
          expires_date_ms: "10000",
          is_trial_period: "false",
        },
        {
          purchase_date_ms: "1600000000",
          expires_date_ms: "10000",
          is_trial_period: "true",
        },
      ],
    };
    const purchase = apple.processSubscriptionPurchase({} as any, receipt);
    expect(purchase.isTrialConversion).toEqual(true);
  });

  each([
    ["100000", true, false],
    [new Date(new Date().getTime() + 5000).getTime().toString(), false, true], // Future Date
    [new Date(new Date().getTime() - 5000).getTime().toString(), false, false], // Past Date
  ]).test("Test isSubscriptionActive", (timestamp, isRefunded, expected) => {
    const receipt: any = {
      latest_receipt_info: [
        {
          expires_date_ms: timestamp,
        },
      ],
    };
    const purchase = apple.processSubscriptionPurchase(
      { isRefunded } as any,
      receipt
    );
    expect(purchase.isSubscriptionActive).toEqual(expected);
  });

  each([
    [new Date(new Date().getTime() + 5000).getTime().toString(), true], // Future Date
    [new Date(new Date().getTime() - 5000).getTime().toString(), false], // Past Date
    [undefined, false], // Past Date
  ]).test("Test isSubscriptionGracePeriod", (timestamp, expected) => {
    const receipt: any = {
      latest_receipt_info: [
        {
          expires_date_ms: "1000000",
        },
      ],
      pending_renewal_info: [
        {
          grace_period_expires_date_ms: timestamp,
        },
      ],
    };
    const purchase = apple.processSubscriptionPurchase({} as any, receipt);
    expect(purchase.isSubscriptionGracePeriod).toEqual(expected);
  });
});
