-- Hotel ↔ Tenant 整合
ALTER TABLE "hotels" ADD COLUMN "tenant_id" TEXT;

-- 為既有 Tenant 建立 Hotel（若尚無對應）
INSERT INTO "hotels" ("id", "tenant_id", "name", "created_at")
SELECT gen_random_uuid(), t."id", t."name", NOW()
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "hotels" h WHERE h."tenant_id" = t."id"
);

-- 新欄位設為必填並加外鍵
ALTER TABLE "hotels" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE UNIQUE INDEX "hotels_tenant_id_key" ON "hotels"("tenant_id");
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Room 可選關聯 Asset
ALTER TABLE "rooms" ADD COLUMN "asset_id" TEXT;
CREATE UNIQUE INDEX "rooms_asset_id_key" ON "rooms"("asset_id");
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GuestRequest 擴充
ALTER TABLE "guest_requests" ADD COLUMN "target_department" "Department" NOT NULL DEFAULT 'FRONT_DESK';
ALTER TABLE "guest_requests" ADD COLUMN "notes" TEXT;
ALTER TABLE "guest_requests" ADD COLUMN "handled_by_id" TEXT;
ALTER TABLE "guest_requests" ADD COLUMN "completed_at" TIMESTAMPTZ;

ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_handled_by_id_fkey"
  FOREIGN KEY ("handled_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "guest_requests_hotel_id_target_department_status_idx"
  ON "guest_requests"("hotel_id", "target_department", "status");

-- Reminder 關聯住客請求（UUID 對應 guest_requests.id）
ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "guestRequestId" UUID;
ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_guestRequestId_fkey";
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_guestRequestId_fkey"
  FOREIGN KEY ("guestRequestId") REFERENCES "guest_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Reminder_guestRequestId_idx" ON "Reminder"("guestRequestId");
