-- CreateEnum
CREATE TYPE "HandoverItemType" AS ENUM ('HIGHLIGHT', 'OPEN_ITEM');

-- CreateTable
CREATE TABLE "ShiftHandoverAck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceLogbookId" TEXT NOT NULL,
    "itemType" "HandoverItemType" NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "completedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftHandoverAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftHandoverAck_tenantId_idx" ON "ShiftHandoverAck"("tenantId");

-- CreateIndex
CREATE INDEX "ShiftHandoverAck_sourceLogbookId_idx" ON "ShiftHandoverAck"("sourceLogbookId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftHandoverAck_sourceLogbookId_itemType_itemIndex_key" ON "ShiftHandoverAck"("sourceLogbookId", "itemType", "itemIndex");

-- AddForeignKey
ALTER TABLE "ShiftHandoverAck" ADD CONSTRAINT "ShiftHandoverAck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverAck" ADD CONSTRAINT "ShiftHandoverAck_sourceLogbookId_fkey" FOREIGN KEY ("sourceLogbookId") REFERENCES "ShiftLogbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftHandoverAck" ADD CONSTRAINT "ShiftHandoverAck_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
