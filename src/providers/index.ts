import { Platform } from "../../types";
import Apple from "./Apple";
import { IAPProvider } from "./IAPProvider";

export function getProvider(platform: Platform): IAPProvider {
  if (platform === "ios") {
    return new Apple(process.env.APPLE_SHARED_SECRET);
  }

  throw Error(`Platform ${platform} no supported!`);
}
