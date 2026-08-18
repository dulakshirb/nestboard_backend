import { Prisma, type PrismaClient } from "../generated/client.js";
import { BookingStatus, PaymentStatus } from "../generated/enums.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import type { CreateBookingInput } from "../schemas/booking.js";
import { leaseRange, TEN_MIN_MS } from "./availability.js";
import { createNotification } from "./notification-service.js";
async function createBooking(
  tenantId: string,
  input: CreateBookingInput,
  statuses: { bookingStatus: BookingStatus; paymentStatus: PaymentStatus },
  db: PrismaClient,
) {
  const { start, end } = leaseRange(input.startMonth, input.durationMonths);

  return db.$transaction(
    async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: input.roomId },
        include: { roomType: true },
      });
      if (!room) throw Errors.notFound("Room");
      if (!room.isAvailable || !room.roomType.isAvailable) {
        throw Errors.conflict("Room is not available");
      }
      if (input.seatNumber > room.seatCapacity) {
        throw Errors.validation(
          `Seat ${input.seatNumber} exceeds capacity ${room.seatCapacity}`,
        );
      }

      const conflict = await tx.booking.findFirst({
        where: {
          roomId: input.roomId,
          seatNumber: input.seatNumber,
          bookingStatus: {
            in: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
          },
          leaseStart: { lt: end },
          leaseEnd: { gt: start },
        },
        select: {
          id: true,
          bookingStatus: true,
          createdAt: true,
          tenantId: true,
          seatNumber: true,
          room: {
            include: { roomType: { include: { property: true } } },
          },
        },
      });

      if (conflict) {
        const isStale =
          conflict.bookingStatus === BookingStatus.PENDING &&
          Date.now() - conflict.createdAt.getTime() > TEN_MIN_MS;
        if (isStale) {
          await tx.booking.update({
            where: { id: conflict.id },
            data: {
              bookingStatus: BookingStatus.EXPIRED,
              paymentStatus: PaymentStatus.FAILED,
            },
          });
          await createNotification({
            userId: conflict.tenantId,
            type: "BOOKING_EXPIRED",
            message: `Your booking for ${conflict.room.roomType.property.title} — ${conflict.room.roomLabel} Seat ${conflict.seatNumber} has expired.`,
            bookingId: conflict.id,
            propertyId: conflict.room.roomType.property.id,
          }, tx as PrismaClient);
        } else {
          throw Errors.conflict("Seat unavailable for this period");
        }
      }

      const totalAmount = room.roomType.pricePerMonth.mul(
        input.durationMonths,
      );

      return tx.booking.create({
        data: {
          tenantId,
          roomId: input.roomId,
          seatNumber: input.seatNumber,
          leaseStart: start,
          leaseEnd: end,
          durationMonths: input.durationMonths,
          totalAmount,
          paymentStatus: statuses.paymentStatus,
          bookingStatus: statuses.bookingStatus,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function createBookingPending(
  tenantId: string,
  input: CreateBookingInput,
  db: PrismaClient = defaultPrisma,
) {
  const result = await createBooking(
    tenantId,
    input,
    {
      bookingStatus: BookingStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
    },
    db,
  );

  const full = await db.booking.findUnique({
    where: { id: result.id },
    include: { room: { include: { roomType: { include: { property: true } } } } },
  });

  if (full) {
    const property = full.room.roomType.property;
    await createNotification({
      userId: tenantId,
      type: "BOOKING_RECEIVED",
      message: `Your booking request for ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber} is pending confirmation.`,
      bookingId: full.id,
      propertyId: property.id,
    });
    if (property.vendorId !== tenantId) {
      await createNotification({
        userId: property.vendorId,
        type: "BOOKING_RECEIVED",
        message: `New booking request at ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber}. Awaiting confirmation.`,
        bookingId: full.id,
        propertyId: property.id,
      });
    }
  }

  return result;
}

// books and confirms in a single transaction
export async function createBookingConfirmed(
  tenantId: string,
  input: CreateBookingInput,
  db: PrismaClient = defaultPrisma,
) {
  const result = await createBooking(
    tenantId,
    input,
    {
      bookingStatus: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
    },
    db,
  );

  const full = await db.booking.findUnique({
    where: { id: result.id },
    include: { room: { include: { roomType: { include: { property: true } } } } },
  });

  if (full) {
    const property = full.room.roomType.property;
    await createNotification({
      userId: tenantId,
      type: "BOOKING_CONFIRMED",
      message: `Your booking for ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber} has been confirmed.`,
      bookingId: full.id,
      propertyId: property.id,
    });
    if (property.vendorId !== tenantId) {
      await createNotification({
        userId: property.vendorId,
        type: "BOOKING_RECEIVED",
        message: `New confirmed booking at ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber}.`,
        bookingId: full.id,
        propertyId: property.id,
      });
    }
  }

  return result;
}

export async function confirmBooking(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  const result = await db.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { room: { include: { roomType: { include: { property: true } } } } },
      });
      if (!booking) throw Errors.notFound("Booking");
      if (booking.tenantId !== tenantId) throw Errors.forbidden();
      if (booking.bookingStatus !== BookingStatus.PENDING) {
        throw Errors.conflict(`Booking is already ${booking.bookingStatus}`);
      }
      if (Date.now() - booking.createdAt.getTime() > TEN_MIN_MS) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            bookingStatus: BookingStatus.EXPIRED,
            paymentStatus: PaymentStatus.FAILED,
          },
        });
        await createNotification({
          userId: tenantId,
          type: "BOOKING_EXPIRED",
          message: `Your booking for ${booking.room.roomType.property.title} — ${booking.room.roomLabel} Seat ${booking.seatNumber} has expired.`,
          bookingId: booking.id,
          propertyId: booking.room.roomType.property.id,
        }, tx as PrismaClient);
        throw Errors.conflict("Booking expired before payment");
      }
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          bookingStatus: BookingStatus.CONFIRMED,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  const full = await db.booking.findUnique({
    where: { id: result.id },
    include: { room: { include: { roomType: { include: { property: true } } } } },
  });

  if (full) {
    const property = full.room.roomType.property;
    await createNotification({
      userId: tenantId,
      type: "BOOKING_CONFIRMED",
      message: `Your booking for ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber} has been confirmed.`,
      bookingId: full.id,
      propertyId: property.id,
    });
    if (property.vendorId !== tenantId) {
      await createNotification({
        userId: property.vendorId,
        type: "BOOKING_RECEIVED",
        message: `Booking confirmed at ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber}.`,
        bookingId: full.id,
        propertyId: property.id,
      });
    }
  }

  return result;
}

export async function cancelBooking(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  const result = await db.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw Errors.notFound("Booking");
      if (booking.tenantId !== tenantId) throw Errors.forbidden();
      if (booking.bookingStatus === BookingStatus.CANCELLED) {
        throw Errors.conflict("Booking is already cancelled");
      }
      if (booking.bookingStatus === BookingStatus.CONFIRMED) {
        throw Errors.conflict("Cannot cancel a confirmed booking");
      }

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: BookingStatus.CANCELLED,
          paymentStatus: PaymentStatus.FAILED,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  const full = await db.booking.findUnique({
    where: { id: result.id },
    include: { room: { include: { roomType: { include: { property: true } } } } },
  });

  if (full) {
    const property = full.room.roomType.property;
    await createNotification({
      userId: tenantId,
      type: "BOOKING_CANCELLED",
      message: `Your booking for ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber} has been cancelled.`,
      bookingId: full.id,
      propertyId: property.id,
    });
    if (property.vendorId !== tenantId) {
      await createNotification({
        userId: property.vendorId,
        type: "BOOKING_CANCELLED",
        message: `Booking cancelled at ${property.title} — ${full.room.roomLabel} Seat ${full.seatNumber}.`,
        bookingId: full.id,
        propertyId: property.id,
      });
    }
  }

  return result;
}

export async function listMyBookings(
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.booking.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      room: { include: { roomType: { include: { property: true } } } },
    },
  });
}

export async function ListVendorBookings(
  vendorId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.booking.findMany({
    where: {
      room: {
        roomType: {
          property: { vendorId }
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
  })
}