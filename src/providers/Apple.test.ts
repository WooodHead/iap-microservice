/* eslint-disable @typescript-eslint/no-unused-vars */

import "jest-fetch-mock";

import each from "jest-each";
import {
  AppleVerifyReceiptErrorCode,
  AppleVerifyReceiptSuccessfulStatus,
} from "types-apple-iap";

import { Purchase } from "../../types";
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
  test("Redirects from Prod to Sandbox environment", async () => {
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
  test("Gets transactions sorted descending", () => {
    const receipt = [
      { purchase_date_ms: "1000" },
      { purchase_date_ms: "3000" },
      { purchase_date_ms: "2000" },
    ];

    receipt.sort(Apple.sortTransactionsDesc);

    expect(receipt).toEqual([
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
  ]).test("getSubscriptionPeriodType %s %s", (purchase, expected) => {
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
  ]).test(
    "getSubscriptionPeriodType %s %s %s",
    (purchase, renewalInfo, expected) => {
      const apple = new Apple("");
      expect(apple.getCancellationReason(purchase, renewalInfo)).toEqual(
        expected
      );
    }
  );

  test("Test getOriginalOrder", () => {
    const apple = new Apple("");
    const transaction: any = {
      transaction_id: "300",
      original_transaction_id: "100",
    };
    const transactions: any[] = [
      {
        transaction_id: "300",
        original_transaction_id: "100",
      },
      {
        transaction_id: "100",
        original_transaction_id: "100",
      },
    ];

    const order = apple.getOriginalOrder(transaction, transactions);
    expect(order.transaction_id).toEqual("100");
  });

  test("Test mergeTransactions - without newer", () => {
    const apple = new Apple("");

    const inAppTransactions: any[] = [
      {
        transaction_id: "100",
        purchase_date_ms: "100000",
        in_app: true,
      },
      {
        transaction_id: "300",
        purchase_date_ms: "300000",
        in_app: true,
      },
    ];
    const latestReceiptInfo: any[] = [
      {
        transaction_id: "200",
        purchase_date_ms: "200000",
        in_app: false,
      },
      {
        transaction_id: "300",
        purchase_date_ms: "300000",
        in_app: false,
      },
      {
        transaction_id: "400",
        purchase_date_ms: "400000",
        in_app: false,
      },
    ];

    const transactions = apple.mergeTransactions(
      inAppTransactions,
      latestReceiptInfo,
      false
    );

    expect(transactions).toEqual([
      {
        transaction_id: "300",
        purchase_date_ms: "300000",
        in_app: true,
      },
      {
        transaction_id: "200",
        purchase_date_ms: "200000",
        in_app: false,
      },
      {
        transaction_id: "100",
        purchase_date_ms: "100000",
        in_app: true,
      },
    ]);
  });

  test("Test mergeTransactions - with newer", () => {
    const apple = new Apple("");

    const inAppTransactions: any[] = [
      {
        transaction_id: "100",
        purchase_date_ms: "100000",
        in_app: true,
      },
      {
        transaction_id: "300",
        purchase_date_ms: "300000",
        in_app: true,
      },
    ];
    const latestReceiptInfo: any[] = [
      {
        transaction_id: "200",
        purchase_date_ms: "200000",
        in_app: false,
      },
      {
        transaction_id: "300",
        purchase_date_ms: "300000",
        in_app: false,
      },
      {
        transaction_id: "400",
        purchase_date_ms: "400000",
        in_app: false,
      },
    ];

    const transactions = apple.mergeTransactions(
      inAppTransactions,
      latestReceiptInfo,
      true
    );

    expect(transactions).toEqual([
      {
        transaction_id: "400",
        purchase_date_ms: "400000",
        in_app: false,
      },
      {
        transaction_id: "300",
        purchase_date_ms: "300000",
        in_app: true,
      },
      {
        transaction_id: "200",
        purchase_date_ms: "200000",
        in_app: false,
      },
      {
        transaction_id: "100",
        purchase_date_ms: "100000",
        in_app: true,
      },
    ]);
  });
});

describe("Parse Receipt Tests", () => {
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

    const apple = new Apple("");
    const result = apple.parseReceipt(receipt, "", false);
    expect(result.purchases[0].isSandbox).toEqual(expected);
  });

  test("Detects Subscription purchase", () => {
    const apple = new Apple("");
    const mock = jest
      .spyOn(apple, "processSubscriptionTransaction")
      .mockImplementation((a, b) => null);
    const receipt: any = {
      receipt: {
        in_app: [
          {
            expires_date: "asdasd",
          },
        ],
      },
    };

    apple.parseReceipt(receipt, "", false);
    expect(mock.mock.calls.length).toEqual(1);
  });
});

describe("Process Purchase Tests", () => {
  const apple = new Apple("");

  each([
    ["1000000", true],
    [undefined, false],
  ]).test(
    "Test isRefunded - cancellation_date_ms %s == %s",
    (cancellation_date_ms, expected) => {
      const purchase = apple.processPurchaseTransaction(
        {
          cancellation_date_ms,
        } as any,
        new Date(),
        false
      );
      expect(purchase.isRefunded).toEqual(expected);
    }
  );

  each([
    ["1000000", true],
    [undefined, false],
  ]).test(
    "Test isSubscription - expires_date %s == %s",
    (expires_date, expected) => {
      const purchase = apple.processPurchaseTransaction(
        {
          expires_date,
        } as any,
        new Date(),
        false
      );
      expect(purchase.isSubscription).toEqual(expected);
    }
  );

  each([
    ["1", "issue"],
    ["0", "other"],
  ]).test(
    "Test refundReason - cancellation_reason %s == %s",
    (cancellation_reason, expected) => {
      const purchase = apple.processPurchaseTransaction(
        {
          cancellation_date_ms: "10000",
          cancellation_reason,
        } as any,
        new Date(),
        false
      );
      expect(purchase.refundReason).toEqual(expected);
    }
  );
});

describe("Process Subscription Tests", () => {
  const apple = new Apple("");

  beforeEach(() => {
    jest.spyOn(apple, "getOriginalOrder").mockImplementation((a, b) => {
      return {
        web_order_line_item_id: "abc",
      } as any;
    });
  });

  each([
    ["true", true],
    ["false", false],
  ]).test(
    "Test isTrial - is_trial_period %s == %s",
    (is_trial_period, expected) => {
      const receipt: any = {
        receipt: {
          in_app: [
            {
              is_trial_period,
              purchase_date_ms: "10000",
              expires_date_ms: "10000",
              original_transaction_id: "1234",
            },
          ],
        },
        latest_receipt_info: [],
      };

      const purchase = apple.processSubscriptionTransaction(
        receipt.receipt.in_app[0],
        receipt
      );
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
        receipt: {
          in_app: [
            {
              is_in_intro_offer_period,
              expires_date_ms: "10000",
            },
          ],
        },
        latest_receipt_info: [],
      };

      const purchase = apple.processSubscriptionTransaction(
        receipt.receipt.in_app[0],
        receipt
      );
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
        receipt: {
          in_app: [
            {
              expires_date_ms: "10000",
            },
          ],
        },
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

      const purchase = apple.processSubscriptionTransaction(
        receipt.receipt.in_app[0],
        receipt
      );
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
        receipt: {
          in_app: [
            {
              expires_date_ms: "10000",
            },
          ],
        },
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

      const purchase = apple.processSubscriptionTransaction(
        receipt.receipt.in_app[0],
        receipt
      );
      expect(purchase.isSubscriptionRetryPeriod).toEqual(expected);
    }
  );

  test("Test isTrialConversion", () => {
    const receipt: any = {
      receipt: {
        in_app: [
          {
            purchase_date_ms: "1600000001",
            expires_date_ms: "10000",
            is_trial_period: "false",
          },
        ],
      },
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
    const purchase = apple.processSubscriptionTransaction(
      receipt.receipt.in_app[0],
      receipt
    );
    expect(purchase.isTrialConversion).toEqual(true);
  });

  each([
    ["100000", "100000", false],
    [
      new Date(new Date().getTime() + 5000).getTime().toString(),
      undefined,
      true,
    ], // Future Date
    [
      new Date(new Date().getTime() - 5000).getTime().toString(),
      undefined,
      false,
    ], // Past Date
  ]).test(
    "Test isSubscriptionActive %s %s %s",
    (expires_ms, cancellation_ms, expected) => {
      const receipt: any = {
        receipt: {
          in_app: [
            {
              expires_date_ms: expires_ms,
              cancellation_date_ms: cancellation_ms,
            },
          ],
        },
        latest_receipt_info: [],
      };
      const purchase = apple.processSubscriptionTransaction(
        receipt.receipt.in_app[0],
        receipt
      );
      expect(purchase.isSubscriptionActive).toEqual(expected);
    }
  );

  each([
    [new Date(new Date().getTime() + 5000).getTime().toString(), true], // Future Date
    [new Date(new Date().getTime() - 5000).getTime().toString(), false], // Past Date
    [undefined, false], // Past Date
  ]).test("Test isSubscriptionGracePeriod %s %s", (timestamp, expected) => {
    const receipt: any = {
      receipt: {
        in_app: [
          {
            expires_date_ms: "10000",
          },
        ],
      },
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
    const purchase = apple.processSubscriptionTransaction(
      receipt.receipt.in_app[0],
      receipt
    );
    expect(purchase.isSubscriptionGracePeriod).toEqual(expected);
  });

  test("Attaches subscriptionGroup", () => {
    jest.spyOn(apple, "getOriginalOrder").mockImplementation((a, b) => {
      return {
        subscription_group_identifier: "abc",
      } as any;
    });

    const receipt: any = {
      receipt: {
        in_app: [
          {
            expires_date_ms: "10000",
          },
        ],
      },
      latest_receipt_info: [],
      pending_renewal_info: [],
    };
    const purchase = apple.processSubscriptionTransaction(
      receipt.receipt.in_app[0],
      receipt
    );
    expect(purchase.subscriptionGroup).toEqual("abc");
  });
});

describe("getSubscriptionStatus tests", () => {
  test("Cancelled trial subscription is immediately expired", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      subscriptionPeriodType: "trial",
      isSubscriptionActive: true,
      isSubscriptionRenewable: false,
    };
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("expired");
  });

  test("Active trial subscription is not expired", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      subscriptionPeriodType: "trial",
      isSubscriptionRenewable: true,
    };
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("trial");
  });

  test("Refunded subscription", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isRefunded: true,
    };
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("refunded");
  });

  test("Subscription in Grace Period", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionGracePeriod: true,
      isSubscriptionRetryPeriod: true,
    };
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("grace_period");
  });

  test("Subscription in Retry Period", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionGracePeriod: false,
      isSubscriptionRetryPeriod: true,
    };
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("retry_period");
  });

  test("Cancelled and Not Active subscription is Expired", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      isSubscriptionActive: false,
      isSubscriptionRenewable: false,
    };
    const status = Apple.getSubscriptionStatus(purchase);
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
    const status = Apple.getSubscriptionStatus(purchase);
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
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("expired");
  });

  test("Subscription is paused", () => {
    // @ts-ignore
    const purchase: Purchase = {
      isSubscription: true,
      subscriptionState: "paused",
    };
    const status = Apple.getSubscriptionStatus(purchase);
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
    const status = Apple.getSubscriptionStatus(purchase);
    expect(status).toBe("active");
  });
});
