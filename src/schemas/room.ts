import { z } from "zod";

export const createRoomTypeSchema = z
  .object({
    name: z.string().min(2).max(120),
    pricePerMonth: z.number().positive(),
    seatCapacity: z.number().int().min(1).max(20),
    hasAC: z.boolean().default(false),
    isAvailable: z.boolean().default(true),
  })
  .strict();

export const updateRoomTypeSchema = createRoomTypeSchema.partial();

export const createRoomSchema = z
  .object({
    roomLabel: z.string().min(2).max(120),
    isAvailable: z.boolean().default(true),
  })
  .strict();

export const updateRoomSchema = createRoomSchema.partial();

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;