ALTER TABLE "Payment" ADD COLUMN "proofSha256" TEXT;

CREATE UNIQUE INDEX "Payment_proofSha256_key" ON "Payment"("proofSha256");