import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateAccountEmailError,
  JsonFileAuthStore,
} from "@/lib/auth-store";

let temporaryDirectory: string;
let storePath: string;
let store: JsonFileAuthStore;

const userInput = {
  email: "Test@Example.com",
  normalizedEmail: "test@example.com",
  displayName: "Test User",
  passwordHash: "scrypt$1$2$3$salt$hash",
  emailVerificationStatus: "unverified" as const,
};

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "batonflow-auth-"));
  storePath = path.join(temporaryDirectory, "auth.json");
  store = new JsonFileAuthStore(storePath);
});

afterEach(async () => {
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe("JsonFileAuthStore", () => {
  it("creates and finds users by normalized email", async () => {
    const user = await store.createUser(userInput);

    await expect(store.findUserByNormalizedEmail("test@example.com")).resolves.toMatchObject({
      id: user.id,
      email: "Test@Example.com",
      normalizedEmail: "test@example.com",
      displayName: "Test User",
      passwordHash: "scrypt$1$2$3$salt$hash",
      planType: "free",
    });
    await expect(store.findUserByNormalizedEmail("missing@example.com")).resolves.toBeNull();
    await expect(stat(storePath).then((fileStat) => fileStat.mode & 0o777)).resolves.toBe(0o600);
  });

  it("rejects duplicate normalized emails", async () => {
    await store.createUser(userInput);

    await expect(store.createUser({ ...userInput, email: "test@example.com" })).rejects.toBeInstanceOf(
      DuplicateAccountEmailError,
    );
  });

  it("creates, reads, and deletes sessions", async () => {
    const user = await store.createUser(userInput);
    const expiresAt = new Date(Date.now() + 60_000);

    await store.createSession({
      tokenHash: "session-token-hash",
      userId: user.id,
      expiresAt,
    });

    await expect(store.findSessionByTokenHash("session-token-hash")).resolves.toMatchObject({
      expiresAt,
      user: {
        id: user.id,
        normalizedEmail: "test@example.com",
      },
    });

    await store.deleteSessionByTokenHash("session-token-hash");
    await expect(store.findSessionByTokenHash("session-token-hash")).resolves.toBeNull();
  });

  it("rejects unsupported store shapes", async () => {
    await store.createUser(userInput);
    await rm(path.join(temporaryDirectory, "auth.json"));
    await writeFile(path.join(temporaryDirectory, "auth.json"), JSON.stringify({ version: 999 }), "utf8");

    await expect(store.findUserByNormalizedEmail("test@example.com")).rejects.toThrow(
      "Unsupported BatonFlow auth store version",
    );
  });
});
