import fetch from "node-fetch";
import {
  AppleVerifyReceiptErrorCode,
  AppleVerifyReceiptResponseBody,
  AppleVerifyReceiptResponseBodySuccess,
  AppleVerifyReceiptSuccessfulStatus,
} from "types-apple-iap";

import { IAPProvider } from "./IAPProvider";

const ENDPOINT_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";
const ENDPOINT_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt";

export default class Apple implements IAPProvider {
  sharedSecret = "";

  constructor(sharedSecret: string) {
    this.sharedSecret = sharedSecret;
  }

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
