import { PrismaClient } from "@prisma/client";

const defaultDatabaseUrl =
  "postgresql://neondb_owner:npg_uS2ktJYWg7Fp@ep-empty-pine-be4y9gq8-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require&connect_timeout=30";

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

function normalizeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") {
      if (!parsed.searchParams.has("connect_timeout")) {
        parsed.searchParams.set("connect_timeout", "30");
      }
      if (!parsed.searchParams.has("pool_timeout")) {
        parsed.searchParams.set("pool_timeout", "30");
      }
      if (parsed.hostname.includes("-pooler.") && !parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function isTransientConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown };
  if (err.code === "P1017" || err.code === "P1001" || err.code === "P1008") return true;
  if (typeof err.message === "string") {
    return (
      err.message.includes("Server has closed the connection") ||
      err.message.includes("Can't reach database server") ||
      err.message.includes("Connection reset by peer")
    );
  }
  return false;
}

const resolvedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || defaultDatabaseUrl);

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    datasources: {
      db: {
        url: resolvedDatabaseUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (!READ_OPERATIONS.has(operation)) {
            return query(args);
          }
          let lastError: unknown;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              return await query(args);
            } catch (error) {
              lastError = error;
              if (attempt === 0 && isTransientConnectionError(error)) {
                await new Promise((resolve) => setTimeout(resolve, 150));
                continue;
              }
              throw error;
            }
          }
          throw lastError;
        },
      },
    },
  });

  return extended as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
