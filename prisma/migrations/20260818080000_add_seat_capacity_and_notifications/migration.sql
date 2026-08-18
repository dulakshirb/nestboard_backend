-- Add seat_capacity to rooms with a temporary default
ALTER TABLE "rooms" ADD COLUMN "seat_capacity" INTEGER NOT NULL DEFAULT 1;

-- Backfill from room_types
UPDATE "rooms" r
SET "seat_capacity" = rt."seat_capacity"
FROM "room_types" rt
WHERE r."room_type_id" = rt."id";

-- Ensure no room has fewer seats than its max booked seat
UPDATE "rooms" r
SET "seat_capacity" = sub.max_seat
FROM (
  SELECT "room_id", MAX("seat_number") AS max_seat
  FROM "bookings"
  WHERE "booking_status" IN ('CONFIRMED', 'PENDING')
  GROUP BY "room_id"
) sub
WHERE r."id" = sub."room_id" AND r."seat_capacity" < sub."max_seat";

-- Remove the temporary default
ALTER TABLE "rooms" ALTER COLUMN "seat_capacity" DROP DEFAULT;

-- Drop seat_capacity from room_types
ALTER TABLE "room_types" DROP COLUMN "seat_capacity";

-- Create notifications table
CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "booking_id" UUID,
  "property_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);
