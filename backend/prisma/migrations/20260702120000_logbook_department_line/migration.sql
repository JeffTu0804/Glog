-- AlterTable: User.lineUserId for LINE push notifications
ALTER TABLE "User" ADD COLUMN "lineUserId" TEXT;

-- AlterTable: ShiftLogbook.department for per-department logbooks
ALTER TABLE "ShiftLogbook" ADD COLUMN "department" "Department" NOT NULL DEFAULT 'FRONT_DESK';

-- DropIndex
DROP INDEX "ShiftLogbook_tenantId_shiftType_shiftDate_key";

-- DropIndex
DROP INDEX "ShiftLogbook_tenantId_status_idx";

-- DropIndex
DROP INDEX "ShiftLogbook_tenantId_publishedAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "ShiftLogbook_tenantId_department_shiftType_shiftDate_key" ON "ShiftLogbook"("tenantId", "department", "shiftType", "shiftDate");

-- CreateIndex
CREATE INDEX "ShiftLogbook_tenantId_department_status_idx" ON "ShiftLogbook"("tenantId", "department", "status");

-- CreateIndex
CREATE INDEX "ShiftLogbook_tenantId_department_publishedAt_idx" ON "ShiftLogbook"("tenantId", "department", "publishedAt");

-- CreateIndex
CREATE INDEX "User_tenantId_lineUserId_idx" ON "User"("tenantId", "lineUserId");
