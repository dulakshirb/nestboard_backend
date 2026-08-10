import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";

export async function updateUserProfile(
  userId: string,
  data: { displayName?: string; bioTag?: string; avatarUrl?: string }
) {
  // Validate user
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound("User");

  // Update displayName, bioTag, avatarUrl
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.bioTag !== undefined && { bioTag: data.bioTag }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      bioTag: true,
      role: true,
      createdAt: true,
    },
  });

  return updated;
}