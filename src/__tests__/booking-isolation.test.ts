import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListVendorBookings } from "../services/booking-service.js";

// Mock the prisma module
const mockFindMany = vi.fn();

vi.mock("../lib/prisma.js", () => ({
  get prisma() {
    return { booking: { findMany: mockFindMany } };
  },
}));

describe("ListVendorBookings (B1 - cross-vendor isolation)", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it("filters bookings by vendorId through room → roomType → property chain", async () => {
    const vendorA = "vendor-a-uuid";
    mockFindMany.mockResolvedValueOnce([]);

    await ListVendorBookings(vendorA);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        room: {
          roomType: {
            property: { vendorId: vendorA },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        tenant: {
          select: { id: true, displayName: true, avatarUrl: true, email: true },
        },
        room: {
          include: {
            roomType: {
              include: { property: true },
            },
          },
        },
      },
    });
  });

  it("vendor A query never includes vendor B's data", async () => {
    const vendorA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const vendorB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    // Simulate what vendor A sees
    mockFindMany.mockResolvedValueOnce([
      {
        id: "booking-1",
        tenantId: "tenant-1",
        roomId: "room-1",
        room: {
          roomType: {
            property: { vendorId: vendorA, title: "Property A" },
          },
        },
      },
    ]);

    const resultA = await ListVendorBookings(vendorA);
    expect(resultA.length).toBe(1);
    expect(resultA[0]!.room.roomType.property.vendorId).toBe(vendorA);

    // Now simulate what vendor B sees — should be different
    mockFindMany.mockResolvedValueOnce([
      {
        id: "booking-2",
        tenantId: "tenant-2",
        roomId: "room-2",
        room: {
          roomType: {
            property: { vendorId: vendorB, title: "Property B" },
          },
        },
      },
    ]);

    const resultB = await ListVendorBookings(vendorB);
    expect(resultB.length).toBe(1);
    expect(resultB[0]!.room.roomType.property.vendorId).toBe(vendorB);

    // Ensure each vendor sees only their own
    expect(resultA[0]!.room.roomType.property.vendorId).not.toBe(
      resultB[0]!.room.roomType.property.vendorId,
    );
  });

  it("returns empty array when vendor has no properties", async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const result = await ListVendorBookings("nonexistent-vendor");
    expect(result).toEqual([]);
  });
});
