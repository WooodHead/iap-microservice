import {
  AppleVerifyReceiptResponseBody,
  AppleVerifyReceiptResponseBodySuccess,
} from "types-apple-iap";

import { ParsedReceipt } from "../../types";

export interface IAPProvider {
  validate(
    token: string,
    sandbox?: boolean
  ): Promise<AppleVerifyReceiptResponseBody>;

  parseReceipt(
    receipt: AppleVerifyReceiptResponseBodySuccess,
    token: string,
    includeNewer: boolean
  ): ParsedReceipt;
}
