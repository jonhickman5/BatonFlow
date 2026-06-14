import { describe, expect, it } from "vitest";
import { isValidAccountEmail, normalizeAccountEmail } from "./auth";

describe("account email helpers", () => {
  it("normalizes account emails", () => {
    expect(normalizeAccountEmail(" Jon@Example.COM ")).toBe("jon@example.com");
  });

  it("accepts basic email addresses", () => {
    expect(isValidAccountEmail("jon@example.com")).toBe(true);
  });

  it("rejects malformed emails", () => {
    expect(isValidAccountEmail("not-an-email")).toBe(false);
    expect(isValidAccountEmail("missing-domain@")).toBe(false);
    expect(isValidAccountEmail("@missing-local.com")).toBe(false);
  });
});
