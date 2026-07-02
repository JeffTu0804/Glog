-- Repair partially applied migration (guestRequestId type fix)
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_guestRequestId_fkey";
ALTER TABLE "Reminder" DROP COLUMN IF EXISTS "guestRequestId";
ALTER TABLE "Reminder" ADD COLUMN "guestRequestId" UUID;
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_guestRequestId_fkey"
  FOREIGN KEY ("guestRequestId") REFERENCES "guest_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Reminder_guestRequestId_idx" ON "Reminder"("guestRequestId");
