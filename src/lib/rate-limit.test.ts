import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("rate limiter", () => {
  it("allows requests up to the configured limit", () => {
    const key = `allowed-${Date.now()}`;

    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });

  it("resets expired buckets", () => {
    const key = `reset-${Date.now()}`;

    expect(checkRateLimit(key, 1, -1)).toBe(true);
    expect(checkRateLimit(key, 1, 60_000)).toBe(true);
  });
});
