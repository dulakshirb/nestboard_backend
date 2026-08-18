import type { PrismaClient } from "../generated/client.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";

export async function createNotification(
  data: {
    userId: string;
    type: string;
    message: string;
    bookingId?: string;
    propertyId?: string;
  },
  db: PrismaClient = defaultPrisma,
) {
  return db.notification.create({ data });
}

export async function listNotifications(
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      booking: {
        select: { id: true, seatNumber: true, leaseStart: true, leaseEnd: true },
      },
      property: {
        select: { id: true, title: true },
      },
    },
  });
}

export async function getUnreadCount(
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.notification.count({
    where: { userId, read: false },
  });
}

export async function markAsRead(
  notificationId: string,
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) throw Errors.notFound("Notification");
  if (notification.userId !== userId) throw Errors.forbidden();

  return db.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

export async function markAllAsRead(
  userId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}
