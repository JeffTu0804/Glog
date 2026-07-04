-- public.profiles：對應 auth.users，控制 glog / glog Manager 入口
CREATE TABLE IF NOT EXISTS "profiles" (
    "id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_role_check" CHECK ("role" IN ('user', 'manager'))
);

CREATE INDEX IF NOT EXISTS "profiles_role_idx" ON "profiles"("role");

-- 將既有飯店端使用者補成 user
INSERT INTO "profiles" ("id", "role")
SELECT CAST("supabaseUserId" AS UUID), 'user'
FROM "User"
WHERE "supabaseUserId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- 將既有平台管理員提升為 manager
INSERT INTO "profiles" ("id", "role")
SELECT CAST("supabaseUserId" AS UUID), 'manager'
FROM "PlatformAdmin"
WHERE "supabaseUserId" IS NOT NULL
ON CONFLICT ("id") DO UPDATE SET
  "role" = 'manager',
  "updated_at" = NOW();
