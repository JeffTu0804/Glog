-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "completionPhotoUrl" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'web';
