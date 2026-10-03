-- Store only private server-side metadata; the binary remains outside public assets.
ALTER TABLE "Payment" ADD COLUMN "proofStorageKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofOriginalName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofMimeType" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofSizeBytes" INTEGER;

CREATE UNIQUE INDEX "Payment_proofStorageKey_key" ON "Payment"("proofStorageKey");
