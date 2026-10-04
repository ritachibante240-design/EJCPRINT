-- Store only private server-side metadata; the binary remains outside public assets.
ALTER TABLE "Order" ADD COLUMN "externalReference" TEXT;
CREATE UNIQUE INDEX "Order_externalReference_key" ON "Order"("externalReference");

CREATE TABLE "Payment" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"externalReference" TEXT,
	"orderId" TEXT NOT NULL,
	"amountCents" INTEGER NOT NULL,
	"method" TEXT NOT NULL,
	"type" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'PENDING',
	"reference" TEXT,
	"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"confirmedAt" DATETIME,
	CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Payment_externalReference_key" ON "Payment"("externalReference");

ALTER TABLE "Payment" ADD COLUMN "proofStorageKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofOriginalName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofMimeType" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofSizeBytes" INTEGER;

CREATE UNIQUE INDEX "Payment_proofStorageKey_key" ON "Payment"("proofStorageKey");
