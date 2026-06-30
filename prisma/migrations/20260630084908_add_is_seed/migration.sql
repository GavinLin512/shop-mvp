-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "isSeed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "isSeed" BOOLEAN NOT NULL DEFAULT false;
