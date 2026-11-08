-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SMS';

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "emailCategories" "TaskCategory"[];
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "emailMinPriority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "smsMinPriority" "TaskPriority" NOT NULL DEFAULT 'HIGH';
ALTER TABLE "UserPreference" ADD COLUMN IF NOT EXISTS "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
