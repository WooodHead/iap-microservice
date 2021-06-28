import { AppleVerifyReceiptResponseBody } from "types-apple-iap";

export interface IAPProvider {
  validate(token: string): Promise<AppleVerifyReceiptResponseBody>;
}
