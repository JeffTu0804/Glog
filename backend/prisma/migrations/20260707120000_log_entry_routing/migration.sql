-- CreateEnum
CREATE TYPE "LogEntryVisibility" AS ENUM ('INTERNAL', 'SHARED');

-- CreateEnum
CREATE TYPE "LogEntryUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "ShiftLogEntry" ADD COLUMN     "visibility" "LogEntryVisibility" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "sharedWith" "Department"[] DEFAULT ARRAY[]::"Department"[],
ADD COLUMN     "routingReason" TEXT,
ADD COLUMN     "urgency" "LogEntryUrgency" NOT NULL DEFAULT 'LOW',
ADD COLUMN     "sourceDepartment" "Department",
ADD COLUMN     "routingGroupId" TEXT,
ADD COLUMN     "isRoutedMirror" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ShiftLogEntry_routingGroupId_idx" ON "ShiftLogEntry"("routingGroupId");
