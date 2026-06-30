-- CreateEnum
CREATE TYPE "TicketResolutionType" AS ENUM ('COMPLETED', 'NEEDS_FRONT_DESK');

-- CreateEnum
CREATE TYPE "TicketAttachmentKind" AS ENUM ('COMPLETION', 'ESCALATION');

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'PENDING_FRONT_DESK' BEFORE 'COMPLETED';

-- AlterTable
ALTER TABLE "MaintenanceTicket" ADD COLUMN "resolutionNote" TEXT,
ADD COLUMN "resolutionType" "TicketResolutionType",
ADD COLUMN "resolutionAt" TIMESTAMP(3),
ADD COLUMN "frontDeskNote" TEXT;

-- AlterTable
ALTER TABLE "Reminder" ALTER COLUMN "serviceRequestId" DROP NOT NULL;
ALTER TABLE "Reminder" ADD COLUMN "maintenanceTicketId" TEXT;

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "kind" "TicketAttachmentKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketAttachment_tenantId_idx" ON "TicketAttachment"("tenantId");

-- CreateIndex
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateIndex
CREATE INDEX "Reminder_maintenanceTicketId_idx" ON "Reminder"("maintenanceTicketId");

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_maintenanceTicketId_fkey" FOREIGN KEY ("maintenanceTicketId") REFERENCES "MaintenanceTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
