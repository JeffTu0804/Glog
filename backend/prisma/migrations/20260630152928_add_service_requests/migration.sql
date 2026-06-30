-- CreateEnum
CREATE TYPE "Department" AS ENUM ('FRONT_DESK', 'FOOD_BEVERAGE', 'HOUSEKEEPING', 'ENGINEERING', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('RESTAURANT_RESERVATION', 'GENERAL');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'TRIGGERED', 'DISMISSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'FOOD_BEVERAGE';

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ServiceRequestType" NOT NULL DEFAULT 'RESTAURANT_RESERVATION',
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "guestRoom" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "targetDepartment" "Department" NOT NULL,
    "sourceDepartment" "Department" NOT NULL DEFAULT 'FRONT_DESK',
    "createdById" TEXT NOT NULL,
    "handledById" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "reminderAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notifyDepartment" "Department" NOT NULL DEFAULT 'FRONT_DESK',
    "triggeredAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_idx" ON "ServiceRequest"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_targetDepartment_status_idx" ON "ServiceRequest"("tenantId", "targetDepartment", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_createdById_idx" ON "ServiceRequest"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "ServiceRequest_tenantId_scheduledAt_idx" ON "ServiceRequest"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Reminder_tenantId_status_remindAt_idx" ON "Reminder"("tenantId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "Reminder_serviceRequestId_idx" ON "Reminder"("serviceRequestId");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
