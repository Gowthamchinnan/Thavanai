import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  addMonthsClampedISO,
  getIndiaMonthRange,
  indiaDayRangeUTC,
  indiaLocalInputToDate,
  isValidISODate,
} from "@/lib/dates";
import { formatINR, money, percent } from "@/lib/money";
import { normalizeMobile, buildWhatsAppUrl } from "@/lib/whatsapp";
import { computeInstallmentStatus } from "@/lib/installments";

describe("dates", () => {
  it("validates ISO calendar dates", () => {
    expect(isValidISODate("2024-02-29")).toBe(true);
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
  });

  it("adds days and clamps months", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonthsClampedISO("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("parses India wall-clock input to UTC", () => {
    const parsed = indiaLocalInputToDate("2026-06-01T10:30");
    expect(parsed?.toISOString()).toBe("2026-06-01T05:00:00.000Z");
  });

  it("builds India day and month ranges", () => {
    const day = indiaDayRangeUTC("2026-06-01");
    expect(day.start.toISOString()).toBe("2026-05-31T18:30:00.000Z");
    expect(day.end.toISOString()).toBe("2026-06-01T18:30:00.000Z");
    const month = getIndiaMonthRange(new Date("2026-06-15T00:00:00.000Z"));
    expect(month.from).toBe("2026-06-01");
    expect(month.to).toBe("2026-06-30");
  });
});

describe("money", () => {
  it("formats INR without floating point drift", () => {
    expect(money("0.1")).toBe("0.10");
    expect(formatINR("1234567.891")).toContain("12,34,567.89");
    expect(percent("250.00", "1000.00")).toBe(25);
  });
});

describe("installments", () => {
  it("computes paid, overdue, due today and upcoming states", () => {
    expect(computeInstallmentStatus({ dueDate: "2026-01-01", scheduledAmount: "100", paidAmount: "100", today: "2026-01-05" })).toBe("PAID");
    expect(computeInstallmentStatus({ dueDate: "2026-01-01", scheduledAmount: "100", paidAmount: "0", today: "2026-01-05" })).toBe("OVERDUE");
    expect(computeInstallmentStatus({ dueDate: "2026-01-05", scheduledAmount: "100", paidAmount: "0", today: "2026-01-05" })).toBe("DUE_TODAY");
    expect(computeInstallmentStatus({ dueDate: "2026-02-01", scheduledAmount: "100", paidAmount: "50", today: "2026-01-05" })).toBe("PARTIALLY_PAID");
    expect(computeInstallmentStatus({ dueDate: "2026-02-01", scheduledAmount: "100", paidAmount: "0", today: "2026-01-05" })).toBe("UPCOMING");
  });
});

describe("WhatsApp helpers", () => {
  it("normalizes Indian mobile numbers and builds wa.me URLs", () => {
    expect(normalizeMobile("+91 98765 43210")).toBe("9876543210");
    expect(normalizeMobile("09876543210")).toBe("9876543210");
    expect(normalizeMobile("12345")).toBeNull();
    expect(buildWhatsAppUrl("9876543210", "Hello & welcome")).toBe(
      "https://wa.me/919876543210?text=Hello%20%26%20welcome",
    );
  });
});
