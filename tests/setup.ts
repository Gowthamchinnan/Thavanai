import "dotenv/config";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-only-secret-not-for-production-use";
process.env.AUTH_TRUST_HOST ??= "true";
