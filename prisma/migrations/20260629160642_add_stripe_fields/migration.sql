-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "providerCustomerId" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "providerPaymentMethodId" TEXT;
