-- ChatHub：對話訊息與營運工單綁定
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_user_id" TEXT,
    "line_user_id" TEXT,
    "sender" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ticket_id" TEXT,
    "ticket_kind" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_messages_tenant_id_staff_user_id_created_at_idx"
  ON "chat_messages"("tenant_id", "staff_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "chat_messages_tenant_id_ticket_id_idx"
  ON "chat_messages"("tenant_id", "ticket_id");

CREATE INDEX IF NOT EXISTS "chat_messages_tenant_id_line_user_id_idx"
  ON "chat_messages"("tenant_id", "line_user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_tenant_id_fkey'
  ) THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_staff_user_id_fkey'
  ) THEN
    ALTER TABLE "chat_messages"
      ADD CONSTRAINT "chat_messages_staff_user_id_fkey"
      FOREIGN KEY ("staff_user_id") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
