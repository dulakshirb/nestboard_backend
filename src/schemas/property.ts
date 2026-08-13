import { z } from "zod";

export const createPropertySchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(2000),
    address: z.string().min(3).max(200),
    city: z.string().min(3).max(120),
    type: z.enum(["HOUSE", "VILLA", "APARTMENT", "HOTEL"]),
    amenities: z.array(z.string()).default([]),
    latitude: z.float32(),
    longitude: z.float32(),
    imageUrl: z.url(),
    minStay: z.string().default("1 month"),
  })
  .strict();

export const updatePropertySchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(2000),
    address: z.string().min(3).max(200),
    city: z.string().min(3).max(120),
    type: z.enum(["HOUSE", "VILLA", "APARTMENT", "HOTEL"]),
    amenities: z.array(z.string()),
    latitude: z.float32(),
    longitude: z.float32(),
    imageUrl: z.url(),
    minStay: z.string(),
    isActive: z.boolean(),
  })
  .strict()
  .partial();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;