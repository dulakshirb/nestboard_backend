import { BookingStatus } from "../generated/enums.js";
import type { PrismaClient } from "../generated/client.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";

export async function createOrUpdateReview(
  userId: string,
  propertyId: string,
  data: { rating: number; comment?: string | null },
  db: PrismaClient = defaultPrisma,
) {
  // Verify Property
  const property = await db.property.findUnique({
    where: { id: propertyId }
  });
  if (!property) throw Errors.notFound("Property")

  // check user has a confirmed booking for this property
  const booking = await db.booking.findFirst({
    where: {
      tenantId: userId,
      room: {
        roomType: {
          property: { id: propertyId },
        },
      },
      bookingStatus: BookingStatus.CONFIRMED,
    },
    select: { id: true },
  });
  if (!booking) throw Errors.forbidden("You can only review properties you have booked and confirmed");

  //Create or update review
  const existingReview = await db.review.findUnique({
    where: { userId_propertyId: { userId, propertyId } },
    select: { id: true },
  });

  const review = await db.review.upsert({
    where: {
      userId_propertyId: {
        userId,
        propertyId
      },
    },
    update: {
      rating: data.rating,
      comment: data.comment ?? null
    },
    create: {
      userId,
      propertyId,
      bookingId: booking.id,
      rating: data.rating,
      comment: data.comment ?? null
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true
        },
      },
    },
  });

  // Update property rating
  await updatePropertyRating(propertyId, db);

  return { review, created: !existingReview };
}

export async function updatePropertyRating(propertyId: string, db: PrismaClient = defaultPrisma) {
  const reviews = await db.review.findMany({
    where: { propertyId },
  });

  if (reviews.length === 0) {
    await db.property.update({
      where: { id: propertyId },
      data: { rating: 0 }
    });
    return;
  }

  const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  await db.property.update({
    where: { id: propertyId },
    data: { rating: averageRating }
  })
}

export async function getPropertyReviews(
  propertyId: string,
  db: PrismaClient = defaultPrisma,
) {
  const reviews = await db.review.findMany({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return reviews
}

export async function getUserReviewForProperty(
  userId: string,
  propertyId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.review.findUnique({
    where: {
      userId_propertyId: {
        userId,
        propertyId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
}

export async function deleteReview(
  userId: string,
  propertyId: string,
  db: PrismaClient = defaultPrisma,
) {
  const review = await db.review.findUnique({
    where: { userId_propertyId: { userId, propertyId } },
  });
  if (!review) throw Errors.notFound("Review");

  await db.review.delete({
    where: { userId_propertyId: { userId, propertyId } },
  });

  await updatePropertyRating(propertyId, db);
  return { deleted: true };
}