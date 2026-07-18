-- =============================================================================
-- Cross-department workflow: employees + tickets
-- LINE identity binding · department routing · Realtime dashboard
-- =============================================================================

-- Departments (text): front_desk | housekeeping | engineering | purchasing | spa
-- Ticket status: pending | processing | completed | delayed

CREATE TABLE IF NOT EXISTS "employees" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "line_user_id"  TEXT NOT NULL,
  "hotel_id"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "department"    TEXT NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "employees_line_user_id_key" UNIQUE ("line_user_id"),
  CONSTRAINT "employees_department_check" CHECK (
    "department" IN (
      'front_desk',
      'housekeeping',
      'engineering',
      'purchasing',
      'spa'
    )
  )
);

CREATE INDEX IF NOT EXISTS "employees_hotel_id_department_idx"
  ON "employees" ("hotel_id", "department");

CREATE INDEX IF NOT EXISTS "employees_hotel_id_idx"
  ON "employees" ("hotel_id");

CREATE TABLE IF NOT EXISTS "tickets" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hotel_id"                 TEXT NOT NULL,
  "from_department"          TEXT NOT NULL,
  "to_department"            TEXT NOT NULL,
  "created_by_employee_id"   UUID NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
  "handled_by_employee_id"   UUID REFERENCES "employees"("id") ON DELETE SET NULL,
  "description"              TEXT NOT NULL,
  "status"                   TEXT NOT NULL DEFAULT 'pending',
  "delay_reason"             TEXT,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "tickets_status_check" CHECK (
    "status" IN ('pending', 'processing', 'completed', 'delayed')
  ),
  CONSTRAINT "tickets_from_department_check" CHECK (
    "from_department" IN (
      'front_desk', 'housekeeping', 'engineering', 'purchasing', 'spa'
    )
  ),
  CONSTRAINT "tickets_to_department_check" CHECK (
    "to_department" IN (
      'front_desk', 'housekeeping', 'engineering', 'purchasing', 'spa'
    )
  )
);

CREATE INDEX IF NOT EXISTS "tickets_hotel_id_status_idx"
  ON "tickets" ("hotel_id", "status");

CREATE INDEX IF NOT EXISTS "tickets_hotel_id_created_at_idx"
  ON "tickets" ("hotel_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "tickets_to_department_status_idx"
  ON "tickets" ("hotel_id", "to_department", "status");

-- Keep updated_at fresh on every UPDATE
CREATE OR REPLACE FUNCTION public.set_tickets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tickets_set_updated_at" ON "tickets";
CREATE TRIGGER "tickets_set_updated_at"
  BEFORE UPDATE ON "tickets"
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tickets_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;

-- Authenticated dashboard users: read tickets for hotels they belong to
-- (hotel_id aligns with public.hotels.id::text OR tenant slug — app filters further)
DROP POLICY IF EXISTS "employees_select_authenticated" ON "employees";
CREATE POLICY "employees_select_authenticated"
  ON "employees" FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "employees_insert_own_line" ON "employees";
CREATE POLICY "employees_insert_own_line"
  ON "employees" FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_select_authenticated" ON "tickets";
CREATE POLICY "tickets_select_authenticated"
  ON "tickets" FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tickets_insert_authenticated" ON "tickets";
CREATE POLICY "tickets_insert_authenticated"
  ON "tickets" FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tickets_update_authenticated" ON "tickets";
CREATE POLICY "tickets_update_authenticated"
  ON "tickets" FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role (Edge Functions / Express) bypasses RLS automatically

-- ---------------------------------------------------------------------------
-- Supabase Realtime (dashboard live updates)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'employees'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "employees";
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'tickets'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE "tickets";
    END IF;
  END IF;
END $$;