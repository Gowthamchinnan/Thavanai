-- CreateEnum
CREATE TYPE "TrackingLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "CustomerTrackingLink" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "status" "TrackingLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerTrackingLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTrackingLink_tokenHash_key" ON "CustomerTrackingLink"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerTrackingLink_customerId_status_idx" ON "CustomerTrackingLink"("customerId", "status");

-- AddForeignKey
ALTER TABLE "CustomerTrackingLink" ADD CONSTRAINT "CustomerTrackingLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
