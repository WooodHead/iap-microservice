import { Platform } from "../types";
import Apple from "./Apple";
import { Google } from "./Google";
import { IAPProvider } from "./IAPProvider";

export function getProvider(platform: Platform): IAPProvider {
  if (platform === "ios") {
    return new Apple(process.env.APPLE_SHARED_SECRET);
  } else if (platform === "android") {
    return new Google();
  }

  throw Error(`Platform ${platform} no supported!`);
}
