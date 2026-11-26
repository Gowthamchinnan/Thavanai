import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const FALLBACK_SECRET = "uQyh9ZYnXwG4K57LGsrAeT19TE9Jyq5z3k2v3dYHwMk=";

function getEncryptionKey(): Buffer {
  const secret = process.env.TRACKING_TOKEN_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || FALLBACK_SECRET;
  return createHash("sha256").update(`customer-tracking-token:${secret}`).digest();
}

/** Generates a 256-bit cryptographically random URL-safe tracking token. */
export function generateTrackingToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Validates incoming tracking token syntax before hashing or querying. */
export function isValidTrackingTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** Computes a deterministic SHA-256 hex digest for unique DB lookup. */
export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Encrypts a raw tracking token with AES-256-GCM so admins can reuse the active URL. */
export function encryptTrackingToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypts an AES-256-GCM encrypted tracking token for authorized admin reuse. */
export function decryptTrackingToken(payload: string): string | null {
  try {
    const parts = payload.split(".");
    if (parts.length !== 3) return null;
    const [ivPart, tagPart, dataPart] = parts;
    const iv = Buffer.from(ivPart, "base64url");
    const authTag = Buffer.from(tagPart, "base64url");
    const encrypted = Buffer.from(dataPart, "base64url");
    if (iv.length !== 12 || authTag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return isValidTrackingTokenFormat(decrypted) ? decrypted : null;
  } catch {
    return null;
  }
}

export function buildTrackingPath(token: string): string {
  return `/track/${token}`;
}

interface RateBucket {
  timestamps: number[];
}

const requestBuckets = new Map<string, RateBucket>();
const invalidBuckets = new Map<string, RateBucket>();

const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const INVALID_WINDOW_MS = 15 * 60_000;
const MAX_INVALID_PER_WINDOW = 25;

function pruneTimestamps(bucket: RateBucket, cutoff: number): number[] {
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
  return bucket.timestamps;
}

function opportunisticCleanup(map: Map<string, RateBucket>, cutoff: number) {
  if (map.size < 500) return;
  for (const [key, bucket] of map.entries()) {
    if (pruneTimestamps(bucket, cutoff).length === 0) {
      map.delete(key);
    }
  }
}

/** Checks per-IP rate limits on the public tracking endpoint without logging tokens. */
export function isTrackingRateLimited(ipAddress: string | null, now = Date.now()): boolean {
  const key = ipAddress?.trim() || "unknown";
  const reqCutoff = now - REQUEST_WINDOW_MS;
  const invCutoff = now - INVALID_WINDOW_MS;

  const invBucket = invalidBuckets.get(key);
  if (invBucket && pruneTimestamps(invBucket, invCutoff).length >= MAX_INVALID_PER_WINDOW) {
    return true;
  }

  const reqBucket = requestBuckets.get(key) ?? { timestamps: [] };
  const active = pruneTimestamps(reqBucket, reqCutoff);
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  active.push(now);
  requestBuckets.set(key, reqBucket);
  opportunisticCleanup(requestBuckets, reqCutoff);
  return false;
}

/** Records an invalid or revoked tracking token lookup against the caller IP. */
export function recordInvalidTrackingAttempt(ipAddress: string | null, now = Date.now()): void {
  const key = ipAddress?.trim() || "unknown";
  const invCutoff = now - INVALID_WINDOW_MS;
  const bucket = invalidBuckets.get(key) ?? { timestamps: [] };
  const active = pruneTimestamps(bucket, invCutoff);
  active.push(now);
  invalidBuckets.set(key, bucket);
  opportunisticCleanup(invalidBuckets, invCutoff);
}

/** Clears in-memory tracking rate-limit buckets (used in tests). */
export function resetTrackingRateLimits(): void {
  requestBuckets.clear();
  invalidBuckets.clear();
}
