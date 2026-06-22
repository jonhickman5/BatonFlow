import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  userAccountCreate: vi.fn(),
  userAccountDeleteMany: vi.fn(),
  userAccountFindUnique: vi.fn(),
  userGitHubConnectionDeleteMany: vi.fn(),
  userGitHubConnectionFindUnique: vi.fn(),
  userGitHubConnectionUpsert: vi.fn(),
  userSessionCreate: vi.fn(),
  userSessionDeleteMany: vi.fn(),
  userSessionFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userAccount: {
      create: dbMocks.userAccountCreate,
      deleteMany: dbMocks.userAccountDeleteMany,
      findUnique: dbMocks.userAccountFindUnique,
    },
    userSession: {
      create: dbMocks.userSessionCreate,
      deleteMany: dbMocks.userSessionDeleteMany,
      findUnique: dbMocks.userSessionFindUnique,
    },
    userGitHubConnection: {
      deleteMany: dbMocks.userGitHubConnectionDeleteMany,
      findUnique: dbMocks.userGitHubConnectionFindUnique,
      upsert: dbMocks.userGitHubConnectionUpsert,
    },
  },
}));

import {
  AuthStoreUnavailableError,
  DuplicateAccountEmailError,
  JsonFileAuthStore,
  PrismaAuthStore,
  getAuthStore,
} from "@/lib/auth-store";
import type { CreateAuthUserInput } from "@/lib/auth-store";

const createdAt = new Date("2026-06-21T12:00:00.000Z");
const lastUpdated = new Date("2026-06-21T12:01:00.000Z");
const prismaUser = {
  id: "user-1",
  email: "test@example.com",
  normalizedEmail: "test@example.com",
  passwordHash: "hash",
  emailVerificationStatus: "verified" as const,
  phoneNumber: null,
  displayName: "Test User",
  planType: "free" as const,
  createdAt,
  lastUpdated,
};
const createUserInput: CreateAuthUserInput = {
  email: "test@example.com",
  normalizedEmail: "test@example.com",
  displayName: "Test User",
  passwordHash: "hash",
  emailVerificationStatus: "unverified",
};
const prismaGitHubConnection = {
  id: "github-connection-1",
  userId: "user-1",
  githubUserId: BigInt(123),
  login: "jonhickman5",
  name: "Jon",
  avatarUrl: "https://avatars.githubusercontent.com/u/123",
  accessToken: "github-token",
  tokenType: "bearer",
  scope: "repo read:user user:email",
  connectedAt: createdAt,
  lastUpdated,
};

function knownPrismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Prisma failed", {
    code,
    clientVersion: "test",
  });
}

describe("PrismaAuthStore", () => {
  let store: PrismaAuthStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PrismaAuthStore();
  });

  it("finds and serializes users", async () => {
    dbMocks.userAccountFindUnique.mockResolvedValueOnce(prismaUser).mockResolvedValueOnce(null);

    await expect(store.findUserByNormalizedEmail("test@example.com")).resolves.toMatchObject({
      id: "user-1",
      createdAt: "2026-06-21T12:00:00.000Z",
      lastUpdated: "2026-06-21T12:01:00.000Z",
    });
    await expect(store.findUserByNormalizedEmail("missing@example.com")).resolves.toBeNull();
  });

  it("creates users and maps duplicate account errors", async () => {
    dbMocks.userAccountCreate.mockResolvedValueOnce(prismaUser);

    await expect(store.createUser(createUserInput)).resolves.toMatchObject({
      id: "user-1",
      normalizedEmail: "test@example.com",
    });
    expect(dbMocks.userAccountCreate).toHaveBeenCalledWith({ data: createUserInput });

    dbMocks.userAccountCreate.mockRejectedValueOnce(knownPrismaError("P2002"));

    await expect(store.createUser(createUserInput)).rejects.toBeInstanceOf(DuplicateAccountEmailError);
  });

  it("deletes users by id", async () => {
    dbMocks.userAccountDeleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(store.deleteUser("user-1")).resolves.toBeUndefined();

    expect(dbMocks.userAccountDeleteMany).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("creates, finds, and deletes sessions", async () => {
    const expiresAt = new Date("2026-06-22T12:00:00.000Z");

    dbMocks.userSessionCreate.mockResolvedValueOnce({});
    await expect(
      store.createSession({ tokenHash: "token-hash", userId: "user-1", expiresAt }),
    ).resolves.toBeUndefined();
    expect(dbMocks.userSessionCreate).toHaveBeenCalledWith({
      data: { tokenHash: "token-hash", userId: "user-1", expiresAt },
    });

    dbMocks.userSessionFindUnique
      .mockResolvedValueOnce({ expiresAt, user: prismaUser })
      .mockResolvedValueOnce(null);
    await expect(store.findSessionByTokenHash("token-hash")).resolves.toMatchObject({
      expiresAt,
      user: { id: "user-1" },
    });
    await expect(store.findSessionByTokenHash("missing")).resolves.toBeNull();

    dbMocks.userSessionDeleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(store.deleteSessionByTokenHash("token-hash")).resolves.toBeUndefined();
    expect(dbMocks.userSessionDeleteMany).toHaveBeenCalledWith({ where: { tokenHash: "token-hash" } });
  });

  it("gets, upserts, and deletes GitHub connections", async () => {
    dbMocks.userGitHubConnectionFindUnique
      .mockResolvedValueOnce(prismaGitHubConnection)
      .mockResolvedValueOnce(null);

    await expect(store.getGitHubConnection("user-1")).resolves.toMatchObject({
      userId: "user-1",
      githubUserId: 123,
      login: "jonhickman5",
      connectedAt: "2026-06-21T12:00:00.000Z",
    });
    expect(dbMocks.userGitHubConnectionFindUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    await expect(store.getGitHubConnection("missing")).resolves.toBeNull();

    dbMocks.userGitHubConnectionUpsert.mockResolvedValueOnce(prismaGitHubConnection);

    await expect(
      store.upsertGitHubConnection({
        userId: "user-1",
        githubUserId: 123,
        login: "jonhickman5",
        name: "Jon",
        avatarUrl: "https://avatars.githubusercontent.com/u/123",
        accessToken: "github-token",
        tokenType: "bearer",
        scope: "repo read:user user:email",
      }),
    ).resolves.toMatchObject({ login: "jonhickman5" });
    expect(dbMocks.userGitHubConnectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        create: expect.objectContaining({ accessToken: "github-token" }),
        update: expect.objectContaining({ accessToken: "github-token" }),
      }),
    );

    dbMocks.userGitHubConnectionDeleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(store.deleteGitHubConnection("user-1")).resolves.toBeUndefined();
    expect(dbMocks.userGitHubConnectionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("maps unavailable Prisma errors", async () => {
    dbMocks.userAccountFindUnique.mockRejectedValueOnce(knownPrismaError("ECONNREFUSED"));
    await expect(store.findUserByNormalizedEmail("test@example.com")).rejects.toBeInstanceOf(
      AuthStoreUnavailableError,
    );

    dbMocks.userSessionCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientInitializationError("cannot connect", "test"),
    );
    await expect(
      store.createSession({
        tokenHash: "token-hash",
        userId: "user-1",
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(AuthStoreUnavailableError);
  });

  it("uses the file-backed auth store by default", () => {
    const previousAuthStore = process.env.BATONFLOW_AUTH_STORE;

    delete process.env.BATONFLOW_AUTH_STORE;

    expect(getAuthStore()).toBeInstanceOf(JsonFileAuthStore);

    if (previousAuthStore === undefined) {
      delete process.env.BATONFLOW_AUTH_STORE;
    } else {
      process.env.BATONFLOW_AUTH_STORE = previousAuthStore;
    }
  });
});
