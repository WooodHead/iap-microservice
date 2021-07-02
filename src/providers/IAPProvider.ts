import {
  AppleVerifyReceiptResponseBody,
  AppleVerifyReceiptResponseBodySuccess,
} from "types-apple-iap";

import { Purchase } from "../../types";

export interface IAPProvider {
  validate(
    token: string,
    sandbox?: boolean
  ): Promise<AppleVerifyReceiptResponseBody>;

  parseReceipt(
    receipt: AppleVerifyReceiptResponseBodySuccess,
    includeNewer: boolean
  ): Purchase[];
}
