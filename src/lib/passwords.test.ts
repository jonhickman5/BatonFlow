import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("password hashing", () => {
  it("verifies matching passwords without storing the raw password", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).not.toContain("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", passwordHash)).toBe(true);
    expect(await verifyPassword("wrong password", passwordHash)).toBe(false);
  });

  it("fails closed for malformed hashes", async () => {
    expect(await verifyPassword("password", "not-a-real-hash")).toBe(false);
    expect(await verifyPassword("password", "scrypt$bad$8$1$salt$hash")).toBe(false);
    expect(await verifyPassword("password", "scrypt$1$8$1$salt$hash")).toBe(false);
  });
});
