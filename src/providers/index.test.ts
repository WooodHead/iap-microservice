import Apple from "./Apple";
import { getProvider } from "./index";

describe("getProviders tests", () => {
  test("Returns Apple provider", () => {
    const provider = getProvider("ios");
    expect(provider).toBeInstanceOf(Apple);
  });

  test("Throws for unknown provider", () => {
    try {
      // @ts-ignore
      getProvider("unknown");
    } catch (e) {
      expect(e).toBeTruthy();
    }
  });
});
