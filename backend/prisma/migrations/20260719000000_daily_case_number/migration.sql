-- =============================================================================
-- 每日工單流水號（台灣時區 + 原子級併發安全）
-- 格式：YYYYMMDD-NNN（例 20260718-001）
-- =============================================================================

CREATE TABLE IF NOT EXISTS "daily_sequences" (
  "hotel_id"       TEXT NOT NULL,
  "date"           DATE NOT NULL,
  "current_value"  INT  NOT NULL DEFAULT 0,
  CONSTRAINT "daily_sequences_pkey" PRIMARY KEY ("hotel_id", "date")
);

COMMENT ON TABLE "daily_sequences" IS
  '每飯店每日工單流水號計數器；hotel_id 對齊 tickets.hotel_id';

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "case_number" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "tickets_hotel_id_case_number_key"
  ON "tickets" ("hotel_id", "case_number")
  WHERE "case_number" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "tickets_hotel_dept_status_created_idx"
  ON "tickets" ("hotel_id", "to_department", "status", "created_at" ASC);

CREATE INDEX IF NOT EXISTS "tickets_hotel_handler_status_idx"
  ON "tickets" ("hotel_id", "handled_by_employee_id", "status");

-- ---------------------------------------------------------------------------
-- BEFORE INSERT：自動指派 case_number
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_ticket_case_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_today       DATE;
  v_seq         INT;
  v_date_prefix TEXT;
BEGIN
  IF NEW.case_number IS NOT NULL AND btrim(NEW.case_number) <> '' THEN
    RETURN NEW;
  END IF;

  -- 台灣當地日期（避免 UTC 跨日錯位）
  v_today := (now() AT TIME ZONE 'Asia/Taipei')::date;
  v_date_prefix := to_char(v_today, 'YYYYMMDD');

  INSERT INTO "daily_sequences" ("hotel_id", "date", "current_value")
  VALUES (NEW.hotel_id, v_today, 1)
  ON CONFLICT ("hotel_id", "date")
  DO UPDATE
    SET "current_value" = "daily_sequences"."current_value" + 1
  RETURNING "current_value" INTO v_seq;

  NEW.case_number := v_date_prefix || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tickets_assign_case_number" ON "tickets";
CREATE TRIGGER "tickets_assign_case_number"
  BEFORE INSERT ON "tickets"
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_ticket_case_number();
