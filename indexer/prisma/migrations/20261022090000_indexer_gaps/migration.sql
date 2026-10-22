-- CreateTable
CREATE TABLE "IndexerGap" (
    "id" TEXT NOT NULL,
    "fromLedger" INTEGER NOT NULL,
    "toLedger" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndexerGap_fromLedger_idx" ON "IndexerGap"("fromLedger");
