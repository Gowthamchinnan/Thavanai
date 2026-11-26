import { beforeEach, describe, expect, it } from "vitest";
import { loanInputSchema } from "@/lib/validation";
import { buildTrackingWhatsAppMessage } from "@/lib/whatsapp";
import {
  buildTrackingPath,
  decryptTrackingToken,
  encryptTrackingToken,
  generateTrackingToken,
  hashTrackingToken,
  isTrackingRateLimited,
  isValidTrackingTokenFormat,
  recordInvalidTrackingAttempt,
  resetTrackingRateLimits,
} from "@/lib/tracking";

describe("Feature 1: Fixed Thavanai Repayment Validation", () => {
  it("accepts Thavanai when totalRepayment equals nominalAmount", () => {
    const result = loanInputSchema.safeParse({
      customerId: "cust_1",
      category: "THAVANAI",
      nominalAmount: "10000.00",
      deductionAmount: "500.00",
      totalRepayment: "10000.00",
      installmentAmount: "1000.00",
      frequency: "WEEKLY",
      startDate: "2026-11-26",
      firstDueDate: "2026-11-26",
      installmentCount: "10",
      activate: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects Thavanai when totalRepayment differs from nominalAmount", () => {
    const result = loanInputSchema.safeParse({
      customerId: "cust_1",
      category: "THAVANAI",
      nominalAmount: "10000.00",
      deductionAmount: "0",
      totalRepayment: "12000.00",
      installmentAmount: "1000.00",
      frequency: "WEEKLY",
      startDate: "2026-11-26",
      firstDueDate: "2026-11-26",
      installmentCount: "12",
      activate: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.totalRepayment).toContain(
        "Repayment amount must equal the loan amount",
      );
    }
  });
});

describe("Feature 2: Tracking Token Security & Rate Limiting", () => {
  beforeEach(() => {
    resetTrackingRateLimits();
  });

  it("generates cryptographically random, URL-safe tokens with unique SHA-256 hashes", () => {
    const tokenA = generateTrackingToken();
    const tokenB = generateTrackingToken();

    expect(tokenA).not.toBe(tokenB);
    expect(isValidTrackingTokenFormat(tokenA)).toBe(true);
    expect(isValidTrackingTokenFormat(tokenB)).toBe(true);
    expect(hashTrackingToken(tokenA)).toHaveLength(64);
    expect(hashTrackingToken(tokenA)).not.toBe(hashTrackingToken(tokenB));
    expect(buildTrackingPath(tokenA)).toBe(`/track/${tokenA}`);
  });

  it("rejects guessable or malformed token formats", () => {
    expect(isValidTrackingTokenFormat("12345")).toBe(false);
    expect(isValidTrackingTokenFormat("9876543210")).toBe(false);
    expect(isValidTrackingTokenFormat("cust_123")).toBe(false);
    expect(isValidTrackingTokenFormat("invalid token with spaces")).toBe(false);
  });

  it("encrypts and decrypts tokens safely and rejects tampered payloads", () => {
    const raw = generateTrackingToken();
    const encrypted = encryptTrackingToken(raw);
    expect(encrypted).not.toContain(raw);
    expect(decryptTrackingToken(encrypted)).toBe(raw);
    expect(decryptTrackingToken(`${encrypted}x`)).toBeNull();
    expect(decryptTrackingToken("malformed")).toBeNull();
  });

  it("rate-limits repeated invalid tracking token attempts per IP", () => {
    const ip = "203.0.113.10";
    expect(isTrackingRateLimited(ip)).toBe(false);
    for (let i = 0; i < 25; i += 1) {
      recordInvalidTrackingAttempt(ip);
    }
    expect(isTrackingRateLimited(ip)).toBe(true);
    expect(isTrackingRateLimited("203.0.113.11")).toBe(false);
  });

  it("formats WhatsApp tracking message containing the exact URL", () => {
    const url = "https://sivathavanai.vercel.app/track/sampleToken123";
    const msg = buildTrackingWhatsAppMessage(url);
    expect(msg).toContain(url);
  });
});
