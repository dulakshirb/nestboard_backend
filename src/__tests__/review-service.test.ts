import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookingStatus } from "../generated/enums.js";

// Mock prisma
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();

const mockPrisma = {
  property: { findUnique: mockFindUnique, update: mockUpdate },
  booking: { findFirst: mockFindFirst },
  review: {
    findUnique: mockFindUnique,
    upsert: mockUpsert,
    delete: mockDelete,
    findMany: mockFindMany,
  },
};

vi.mock("../lib/prisma.js", () => ({
  get prisma() {
    return mockPrisma;
  },
}));

// We need to import after mocking
const { createOrUpdateReview, deleteReview } = await import(
  "../services/review-service.js"
);

describe("Review service (B4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createOrUpdateReview", () => {
    it("throws if property not found", async () => {
      mockFindUnique.mockResolvedValueOnce(null); // property lookup
      await expect(
        createOrUpdateReview("user-1", "prop-1", { rating: 5 }),
      ).rejects.toThrow();
    });

    it("throws if user has no confirmed booking", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: "prop-1" }); // property exists
      mockFindFirst.mockResolvedValueOnce(null); // no confirmed booking

      await expect(
        createOrUpdateReview("user-1", "prop-1", { rating: 5 }),
      ).rejects.toThrow("You can only review properties you have booked and confirmed");
    });

    it("creates review with upsert when user has confirmed booking", async () => {
      // property exists
      mockFindUnique
        .mockResolvedValueOnce({ id: "prop-1" }) // property lookup
        .mockResolvedValueOnce(null); // existing review lookup (none)
      // confirmed booking exists
      mockFindFirst.mockResolvedValueOnce({ id: "booking-1" });
      // upsert result
      mockUpsert.mockResolvedValueOnce({
        id: "review-1",
        rating: 4,
        comment: "Great",
        user: { id: "user-1", displayName: "Test", avatarUrl: null },
      });
      // updatePropertyRating
      mockFindMany.mockResolvedValueOnce([{ rating: 4 }]);
      mockUpdate.mockResolvedValueOnce({});

      const result = await createOrUpdateReview("user-1", "prop-1", {
        rating: 4,
        comment: "Great",
      });

      expect(result.created).toBe(true);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("enforces one review per user per property via unique constraint", async () => {
      mockFindUnique
        .mockResolvedValueOnce({ id: "prop-1" })
        .mockResolvedValueOnce({ id: "existing-review" }); // existing review found
      mockFindFirst.mockResolvedValueOnce({ id: "booking-1" });
      mockUpsert.mockResolvedValueOnce({
        id: "existing-review",
        rating: 3,
        comment: "Updated",
        user: { id: "user-1", displayName: "Test", avatarUrl: null },
      });
      mockFindMany.mockResolvedValueOnce([{ rating: 3 }]);
      mockUpdate.mockResolvedValueOnce({});

      const result = await createOrUpdateReview("user-1", "prop-1", {
        rating: 3,
        comment: "Updated",
      });

      // Should update, not create
      expect(result.created).toBe(false);
    });
  });

  describe("deleteReview", () => {
    it("throws if review not found", async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      await expect(
        deleteReview("user-1", "prop-1"),
      ).rejects.toThrow();
    });

    it("deletes review and recalculates rating", async () => {
      mockFindUnique.mockResolvedValueOnce({ id: "review-1" });
      mockDelete.mockResolvedValueOnce({});
      mockFindMany.mockResolvedValueOnce([]); // no reviews left
      mockUpdate.mockResolvedValueOnce({});

      const result = await deleteReview("user-1", "prop-1");
      expect(result.deleted).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
      // Rating should be set to 0 since no reviews remain
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "prop-1" },
        data: { rating: 0 },
      });
    });
  });

  describe("average rating computation", () => {
    it("updates property rating as average of all reviews", async () => {
      mockFindUnique
        .mockResolvedValueOnce({ id: "prop-1" })
        .mockResolvedValueOnce(null);
      mockFindFirst.mockResolvedValueOnce({ id: "booking-1" });
      mockUpsert.mockResolvedValueOnce({
        id: "r1",
        rating: 4,
        comment: null,
        user: { id: "user-1", displayName: "A", avatarUrl: null },
      });
      // Simulate 3 reviews averaging to (3+4+5)/3 = 4
      mockFindMany.mockResolvedValueOnce([
        { rating: 3 },
        { rating: 4 },
        { rating: 5 },
      ]);
      mockUpdate.mockResolvedValueOnce({});

      await createOrUpdateReview("user-1", "prop-1", { rating: 4 });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "prop-1" },
        data: { rating: 4 },
      });
    });
  });
});
