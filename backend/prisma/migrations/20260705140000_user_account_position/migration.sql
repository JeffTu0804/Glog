-- 帳號啟用狀態與職級
CREATE TYPE "UserAccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'SUSPENDED');
CREATE TYPE "UserPositionLevel" AS ENUM ('STAFF', 'SUPERVISOR', 'MANAGER');

ALTER TABLE "User" ADD COLUMN "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN "positionLevel" "UserPositionLevel" NOT NULL DEFAULT 'STAFF';

UPDATE "User" SET "positionLevel" = 'MANAGER' WHERE "role" = 'ADMIN';
