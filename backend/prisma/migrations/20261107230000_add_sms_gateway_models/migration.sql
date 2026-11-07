-- CreateEnum
CREATE TYPE "SmsJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmsGatewayStatus" AS ENUM ('ONLINE', 'OFFLINE', 'PAUSED');

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "smsGatewayEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SmsGatewayDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "simOperator" TEXT,
    "simSlot" INTEGER DEFAULT 0,
    "phoneNumber" TEXT,
    "batteryLevel" INTEGER,
    "isCharging" BOOLEAN DEFAULT false,
    "status" "SmsGatewayStatus" NOT NULL DEFAULT 'ONLINE',
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "smsSentCount" INTEGER NOT NULL DEFAULT 0,
    "smsFailedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsGatewayDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SmsJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SmsJobStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "simSlot" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SmsGatewayDevice_deviceId_key" ON "SmsGatewayDevice"("deviceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SmsGatewayDevice_userId_idx" ON "SmsGatewayDevice"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SmsGatewayDevice_status_lastHeartbeatAt_idx" ON "SmsGatewayDevice"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SmsJob_userId_idx" ON "SmsJob"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SmsJob_status_scheduledAt_idx" ON "SmsJob"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SmsJob_claimedBy_idx" ON "SmsJob"("claimedBy");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SmsGatewayDevice_userId_fkey'
    ) THEN
        ALTER TABLE "SmsGatewayDevice" ADD CONSTRAINT "SmsGatewayDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SmsJob_userId_fkey'
    ) THEN
        ALTER TABLE "SmsJob" ADD CONSTRAINT "SmsJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SmsJob_claimedBy_fkey'
    ) THEN
        ALTER TABLE "SmsJob" ADD CONSTRAINT "SmsJob_claimedBy_fkey" FOREIGN KEY ("claimedBy") REFERENCES "SmsGatewayDevice"("deviceId") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

