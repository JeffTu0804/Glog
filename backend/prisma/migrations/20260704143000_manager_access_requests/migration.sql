ALTER TABLE "profiles"
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "name" TEXT,
ADD COLUMN IF NOT EXISTS "manager_access_status" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS "manager_requested_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "manager_reviewed_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "manager_reviewed_by" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_manager_access_status_check'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_manager_access_status_check"
      CHECK ("manager_access_status" IN ('none', 'pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "profiles_manager_access_status_idx"
  ON "profiles" ("manager_access_status");

UPDATE "profiles" p
SET
  "email" = u."email",
  "name" = COALESCE(p."name", u."name"),
  "manager_access_status" = CASE
    WHEN p."role" = 'manager' THEN 'approved'
    ELSE COALESCE(p."manager_access_status", 'none')
  END,
  "manager_reviewed_at" = CASE
    WHEN p."role" = 'manager' AND p."manager_reviewed_at" IS NULL THEN NOW()
    ELSE p."manager_reviewed_at"
  END
FROM "User" u
WHERE u."supabaseUserId"::UUID = p."id";

UPDATE "profiles" p
SET
  "email" = pa."email",
  "name" = pa."name",
  "role" = 'manager',
  "manager_access_status" = 'approved',
  "manager_reviewed_at" = COALESCE(p."manager_reviewed_at", NOW())
FROM "PlatformAdmin" pa
WHERE pa."supabaseUserId"::UUID = p."id";
