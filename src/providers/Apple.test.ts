import "jest-fetch-mock";

import each from "jest-each";
import {
  AppleVerifyReceiptErrorCode,
  AppleVerifyReceiptSuccessfulStatus,
} from "types-apple-iap";

import Apple from "./Apple";

describe("Apple IAP tests", () => {
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
