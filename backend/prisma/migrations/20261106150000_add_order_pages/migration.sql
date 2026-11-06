-- Intervalo de páginas e páginas a cores.
ALTER TABLE "Order" ADD COLUMN "pageRange" TEXT;
ALTER TABLE "Order" ADD COLUMN "colorPages" TEXT;
ALTER TABLE "Order" ADD COLUMN "colorPageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "colorUnitPriceCents" INTEGER NOT NULL DEFAULT 0;
