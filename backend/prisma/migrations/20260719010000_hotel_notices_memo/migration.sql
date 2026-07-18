-- =============================================================================
-- 館內事件／知會照會（TASK | MEMO）+ 時效 expires_at
-- =============================================================================

CREATE TABLE IF NOT EXISTS "hotel_notices" (
  "id"                TEXT PRIMARY KEY,
  "tenant_id"         TEXT NOT NULL,
  "type"              TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'UNREAD',
  "title"             TEXT NOT NULL,
  "content"           TEXT,
  "expires_at"        TIMESTAMPTZ,
  "target_department" TEXT,
  "guest_room"        TEXT,
  "created_by_id"     TEXT NOT NULL,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "hotel_notices_type_check" CHECK ("type" IN ('TASK', 'MEMO')),
  CONSTRAINT "hotel_notices_status_check" CHECK ("status" IN ('UNREAD', 'READ')),
  CONSTRAINT "hotel_notices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hotel_notices_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "hotel_notices_tenant_id_type_status_idx"
  ON "hotel_notices" ("tenant_id", "type", "status");

CREATE INDEX IF NOT EXISTS "hotel_notices_tenant_id_expires_at_idx"
  ON "hotel_notices" ("tenant_id", "expires_at");
