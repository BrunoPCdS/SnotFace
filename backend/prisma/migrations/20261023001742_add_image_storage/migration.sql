/*
  Warnings:

  - Added the required column `expiresAt` to the `Scan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageData` to the `Scan` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_userId_fkey";

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "imageData" BYTEA NOT NULL,
ADD COLUMN     "imageMimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
ADD COLUMN     "memeData" BYTEA,
ADD COLUMN     "memeMimeType" TEXT;

-- CreateIndex
CREATE INDEX "Scan_userId_expiresAt_idx" ON "Scan"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
