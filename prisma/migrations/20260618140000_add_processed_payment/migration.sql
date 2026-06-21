-- CreateTable
CREATE TABLE "ProcessedPayment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'yookassa',
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedPayment_projectId_idx" ON "ProcessedPayment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedPayment_projectId_provider_paymentId_key" ON "ProcessedPayment"("projectId", "provider", "paymentId");
