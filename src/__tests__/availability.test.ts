import { describe, it, expect } from "vitest";
import {
  leaseRange,
  blockingStatusWhere,
  activeBookingWhere,
  TEN_MIN_MS,
} from "../services/availability.js";
import { BookingStatus } from "../generated/enums.js";

describe("leaseRange", () => {
  it("returns correct start and end for 1-month lease", () => {
    const { start, end } = leaseRange("2026-03", 1);
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("returns correct range for multi-month lease", () => {
    const { start, end } = leaseRange("2026-01", 3);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("wraps correctly across year boundary", () => {
    const { start, end } = leaseRange("2025-11", 4);
    expect(start.toISOString()).toBe("2025-11-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("throws on invalid month", () => {
    expect(() => leaseRange("2026-13", 1)).toThrow("Invalid startMonth");
    expect(() => leaseRange("2026-00", 1)).toThrow("Invalid startMonth");
  });

  it("throws on invalid format", () => {
    expect(() => leaseRange("2026/01", 1)).toThrow("Invalid startMonth");
    expect(() => leaseRange("abc", 1)).toThrow("Invalid startMonth");
  });

  it("end is always last day of end month", () => {
    const { end } = leaseRange("2026-02", 1);
    expect(end.getUTCFullYear()).toBe(2026);
    expect(end.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(end.getUTCDate()).toBe(28);
  });
});

describe("blockingStatusWhere", () => {
  it("returns CONFIRMED OR (PENDING < 10 min)", () => {
    const where = blockingStatusWhere();
    expect(where).toEqual({
      OR: [
        { bookingStatus: BookingStatus.CONFIRMED },
        {
          bookingStatus: BookingStatus.PENDING,
          createdAt: { gt: expect.any(Date) },
        },
      ],
    });
  });

  it("PENDING threshold is 10 minutes ago", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const where = blockingStatusWhere(now);
    const pENDINGcondition = (where.OR as any[])[1];
    const threshold = pENDINGcondition.createdAt.gt as Date;
    expect(now.getTime() - threshold.getTime()).toBe(TEN_MIN_MS);
  });
});

describe("activeBookingWhere", () => {
  it("combines lease overlap and blocking status", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-03-31");
    const where = activeBookingWhere(start, end);

    expect(where.leaseStart).toEqual({ lte: end });
    expect(where.leaseEnd).toEqual({ gte: start });
    expect(where.OR).toBeDefined();
    expect((where.OR as any[]).length).toBe(2);
  });

  it("uses current time by default for blocking check", () => {
    const before = Date.now();
    const where = activeBookingWhere(new Date(), new Date());
    const after = Date.now();

    const pENDINGcondition = ((where.OR as any[])[1] as any).createdAt.gt as Date;
    expect(pENDINGcondition.getTime()).toBeGreaterThanOrEqual(before - TEN_MIN_MS - 100);
    expect(pENDINGcondition.getTime()).toBeLessThanOrEqual(after);
  });
});
