import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/batonflow?schema=public";

export const prisma =
  globalForPrisma.prisma ??
  // Prisma 7 requires an explicit driver adapter for PostgreSQL.
  new PrismaClient({
    adapter: new PrismaPg(connectionString),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
