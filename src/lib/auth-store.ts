import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  EmailVerificationStatus,
  GitHubAccountConnection,
  PlanType,
  UserAccount,
} from "@/lib/data-structures";

const STORE_VERSION = 1;
const DEFAULT_STORE_PATH = path.join(process.cwd(), ".data", "batonflow-auth.json");
const writeQueues = new Map<string, Promise<unknown>>();

type AuthSession = {
  id: string;
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type AuthStoreSnapshot = {
  version: typeof STORE_VERSION;
  users: UserAccount[];
  sessions: AuthSession[];
  githubConnections: GitHubAccountConnection[];
  lastUpdated: string;
};

export type CreateAuthUserInput = {
  email: string;
  normalizedEmail: string;
  displayName: string | null;
  passwordHash: string;
  emailVerificationStatus: EmailVerificationStatus;
};

export type CreateAuthSessionInput = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
};

export type UpsertGitHubConnectionInput = Omit<GitHubAccountConnection, "connectedAt" | "lastUpdated">;

export type AuthSessionWithUser = {
  expiresAt: Date;
  user: UserAccount;
};

export interface AuthStore {
  findUserByNormalizedEmail(normalizedEmail: string): Promise<UserAccount | null>;
  createUser(input: CreateAuthUserInput): Promise<UserAccount>;
  deleteUser(userId: string): Promise<void>;
  createSession(input: CreateAuthSessionInput): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionWithUser | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  getGitHubConnection(userId: string): Promise<GitHubAccountConnection | null>;
  upsertGitHubConnection(input: UpsertGitHubConnectionInput): Promise<GitHubAccountConnection>;
  deleteGitHubConnection(userId: string): Promise<void>;
}

export class DuplicateAccountEmailError extends Error {
  constructor() {
    super("That email is already in use.");
  }
}

export class AuthStoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Account storage is unavailable.");
    this.cause = cause;
  }
}

function emptySnapshot(): AuthStoreSnapshot {
  return {
    version: STORE_VERSION,
    users: [],
    sessions: [],
    githubConnections: [],
    lastUpdated: new Date().toISOString(),
  };
}

function isUnavailablePrismaError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["ECONNREFUSED", "P1001"].includes(error.code)) ||
    error instanceof Prisma.PrismaClientInitializationError
  );
}

function toAuthUser(user: {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  emailVerificationStatus: EmailVerificationStatus;
  phoneNumber: string | null;
  displayName: string | null;
  planType: PlanType;
  createdAt: Date;
  lastUpdated: Date;
}): UserAccount {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    lastUpdated: user.lastUpdated.toISOString(),
  };
}

function toGitHubConnection(connection: {
  userId: string;
  githubUserId: bigint | number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  accessToken: string;
  tokenType: string;
  scope: string;
  connectedAt: Date;
  lastUpdated: Date;
}): GitHubAccountConnection {
  return {
    ...connection,
    githubUserId: Number(connection.githubUserId),
    connectedAt: connection.connectedAt.toISOString(),
    lastUpdated: connection.lastUpdated.toISOString(),
  };
}

function mapPrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new DuplicateAccountEmailError();
  }

  if (isUnavailablePrismaError(error)) {
    throw new AuthStoreUnavailableError(error);
  }

  throw error;
}

export class PrismaAuthStore implements AuthStore {
  async findUserByNormalizedEmail(normalizedEmail: string): Promise<UserAccount | null> {
    try {
      const user = await prisma.userAccount.findUnique({ where: { normalizedEmail } });

      return user ? toAuthUser(user) : null;
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async createUser(input: CreateAuthUserInput): Promise<UserAccount> {
    try {
      const user = await prisma.userAccount.create({ data: input });

      return toAuthUser(user);
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await prisma.userAccount.deleteMany({ where: { id: userId } });
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async createSession(input: CreateAuthSessionInput): Promise<void> {
    try {
      await prisma.userSession.create({
        data: {
          tokenHash: input.tokenHash,
          userId: input.userId,
          expiresAt: input.expiresAt,
        },
      });
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionWithUser | null> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!session) {
        return null;
      }

      return {
        expiresAt: session.expiresAt,
        user: toAuthUser(session.user),
      };
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    try {
      await prisma.userSession.deleteMany({ where: { tokenHash } });
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async getGitHubConnection(userId: string): Promise<GitHubAccountConnection | null> {
    try {
      const connection = await prisma.userGitHubConnection.findUnique({ where: { userId } });

      return connection ? toGitHubConnection(connection) : null;
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async upsertGitHubConnection(input: UpsertGitHubConnectionInput): Promise<GitHubAccountConnection> {
    try {
      const connection = await prisma.userGitHubConnection.upsert({
        where: { userId: input.userId },
        create: input,
        update: {
          githubUserId: input.githubUserId,
          login: input.login,
          name: input.name,
          avatarUrl: input.avatarUrl,
          accessToken: input.accessToken,
          tokenType: input.tokenType,
          scope: input.scope,
        },
      });

      return toGitHubConnection(connection);
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async deleteGitHubConnection(userId: string): Promise<void> {
    try {
      await prisma.userGitHubConnection.deleteMany({ where: { userId } });
    } catch (error) {
      mapPrismaError(error);
    }
  }
}

export class JsonFileAuthStore implements AuthStore {
  constructor(private readonly storePath = process.env.BATONFLOW_AUTH_STORE_PATH ?? DEFAULT_STORE_PATH) {}

  async findUserByNormalizedEmail(normalizedEmail: string): Promise<UserAccount | null> {
    const snapshot = await this.readSnapshot();

    return snapshot.users.find((user) => user.normalizedEmail === normalizedEmail) ?? null;
  }

  async createUser(input: CreateAuthUserInput): Promise<UserAccount> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();

      if (snapshot.users.some((user) => user.normalizedEmail === input.normalizedEmail)) {
        throw new DuplicateAccountEmailError();
      }

      const now = new Date().toISOString();
      const user: UserAccount = {
        id: randomUUID(),
        email: input.email,
        normalizedEmail: input.normalizedEmail,
        passwordHash: input.passwordHash,
        emailVerificationStatus: input.emailVerificationStatus,
        phoneNumber: null,
        displayName: input.displayName,
        planType: "free",
        createdAt: now,
        lastUpdated: now,
      };

      snapshot.users.push(user);
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return user;
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();

      snapshot.users = snapshot.users.filter((user) => user.id !== userId);
      snapshot.sessions = snapshot.sessions.filter((session) => session.userId !== userId);
      snapshot.githubConnections = snapshot.githubConnections.filter(
        (connection) => connection.userId !== userId,
      );
      snapshot.lastUpdated = new Date().toISOString();
      await this.writeSnapshot(snapshot);
    });
  }

  async createSession(input: CreateAuthSessionInput): Promise<void> {
    await this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const now = new Date().toISOString();

      snapshot.sessions.push({
        id: randomUUID(),
        tokenHash: input.tokenHash,
        userId: input.userId,
        createdAt: now,
        expiresAt: input.expiresAt.toISOString(),
      });
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);
    });
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionWithUser | null> {
    const snapshot = await this.readSnapshot();
    const session = snapshot.sessions.find((storedSession) => storedSession.tokenHash === tokenHash);

    if (!session) {
      return null;
    }

    const user = snapshot.users.find((storedUser) => storedUser.id === session.userId);

    if (!user) {
      return null;
    }

    return {
      expiresAt: new Date(session.expiresAt),
      user,
    };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();

      snapshot.sessions = snapshot.sessions.filter((session) => session.tokenHash !== tokenHash);
      snapshot.lastUpdated = new Date().toISOString();
      await this.writeSnapshot(snapshot);
    });
  }

  async getGitHubConnection(userId: string): Promise<GitHubAccountConnection | null> {
    const snapshot = await this.readSnapshot();

    return snapshot.githubConnections.find((connection) => connection.userId === userId) ?? null;
  }

  async upsertGitHubConnection(input: UpsertGitHubConnectionInput): Promise<GitHubAccountConnection> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const now = new Date().toISOString();
      const existingConnectionIndex = snapshot.githubConnections.findIndex(
        (connection) => connection.userId === input.userId,
      );
      const existingConnection =
        existingConnectionIndex >= 0 ? snapshot.githubConnections[existingConnectionIndex] : null;
      const connection: GitHubAccountConnection = {
        ...input,
        connectedAt: existingConnection?.connectedAt ?? now,
        lastUpdated: now,
      };

      if (existingConnectionIndex >= 0) {
        snapshot.githubConnections[existingConnectionIndex] = connection;
      } else {
        snapshot.githubConnections.push(connection);
      }

      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return connection;
    });
  }

  async deleteGitHubConnection(userId: string): Promise<void> {
    await this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();

      snapshot.githubConnections = snapshot.githubConnections.filter(
        (connection) => connection.userId !== userId,
      );
      snapshot.lastUpdated = new Date().toISOString();
      await this.writeSnapshot(snapshot);
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previousWrite = writeQueues.get(this.storePath) ?? Promise.resolve();
    const nextWrite = previousWrite.catch(() => undefined).then(operation);

    writeQueues.set(this.storePath, nextWrite.catch(() => undefined));

    return nextWrite;
  }

  private async readSnapshot(): Promise<AuthStoreSnapshot> {
    try {
      const rawSnapshot = await readFile(this.storePath, "utf8");
      const snapshot = JSON.parse(rawSnapshot) as AuthStoreSnapshot;

      if (
        snapshot.version !== STORE_VERSION ||
        !Array.isArray(snapshot.users) ||
        !Array.isArray(snapshot.sessions)
      ) {
        throw new Error(`Unsupported BatonFlow auth store version in ${this.storePath}.`);
      }

      return {
        ...snapshot,
        githubConnections: Array.isArray(snapshot.githubConnections) ? snapshot.githubConnections : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptySnapshot();
      }

      throw error;
    }
  }

  private async writeSnapshot(snapshot: AuthStoreSnapshot): Promise<void> {
    const directory = path.dirname(this.storePath);
    const temporaryPath = path.join(directory, `${path.basename(this.storePath)}.${randomUUID()}.tmp`);

    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.storePath);
  }
}

let authStore: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  authStore ??=
    process.env.BATONFLOW_AUTH_STORE === "postgres" ||
    (process.env.NODE_ENV === "production" && process.env.BATONFLOW_AUTH_STORE !== "file")
      ? new PrismaAuthStore()
      : new JsonFileAuthStore();

  return authStore;
}
