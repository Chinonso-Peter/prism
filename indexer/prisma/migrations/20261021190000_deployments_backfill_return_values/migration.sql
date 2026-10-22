ALTER TABLE "IndexerCursor"
ADD COLUMN "paginationCursor" TEXT;

CREATE TABLE "BackfillCursor" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "fromLedger" INTEGER NOT NULL,
    "toLedger" INTEGER NOT NULL,
    "lastLedger" INTEGER NOT NULL,
    "paginationCursor" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackfillCursor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invocation"
ADD COLUMN "returnValue" TEXT;

CREATE TABLE "Contract" (
    "contractId" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "deploymentLedger" INTEGER NOT NULL,
    "deploymentTxHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("contractId")
);

CREATE UNIQUE INDEX "Contract_deploymentTxHash_key" ON "Contract"("deploymentTxHash");
CREATE INDEX "Contract_creator_idx" ON "Contract"("creator");
