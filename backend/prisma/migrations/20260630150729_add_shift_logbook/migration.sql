-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT');

-- CreateEnum
CREATE TYPE "ShiftLogbookStatus" AS ENUM ('OPEN', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ShiftLogbook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "shiftDate" DATE NOT NULL,
    "shiftStart" TIMESTAMP(3) NOT NULL,
    "shiftEnd" TIMESTAMP(3) NOT NULL,
    "status" "ShiftLogbookStatus" NOT NULL DEFAULT 'OPEN',
    "aiSummary" TEXT,
    "highlights" TEXT[],
    "openItems" TEXT[],
    "snapshotJson" JSONB,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftLogbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftLogEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "logbookId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftLogbook_tenantId_status_idx" ON "ShiftLogbook"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ShiftLogbook_tenantId_publishedAt_idx" ON "ShiftLogbook"("tenantId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftLogbook_tenantId_shiftType_shiftDate_key" ON "ShiftLogbook"("tenantId", "shiftType", "shiftDate");

-- CreateIndex
CREATE INDEX "ShiftLogEntry_tenantId_idx" ON "ShiftLogEntry"("tenantId");

-- CreateIndex
CREATE INDEX "ShiftLogEntry_logbookId_idx" ON "ShiftLogEntry"("logbookId");

-- AddForeignKey
ALTER TABLE "ShiftLogbook" ADD CONSTRAINT "ShiftLogbook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLogbook" ADD CONSTRAINT "ShiftLogbook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLogbook" ADD CONSTRAINT "ShiftLogbook_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLogEntry" ADD CONSTRAINT "ShiftLogEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLogEntry" ADD CONSTRAINT "ShiftLogEntry_logbookId_fkey" FOREIGN KEY ("logbookId") REFERENCES "ShiftLogbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftLogEntry" ADD CONSTRAINT "ShiftLogEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
