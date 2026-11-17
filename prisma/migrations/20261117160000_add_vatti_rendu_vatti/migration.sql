-- CreateEnum
CREATE TYPE "LoanCategory" AS ENUM ('THAVANAI', 'MONTHLY_VATTI', 'WEEKLY_RENDU_VATTI');

-- CreateEnum
CREATE TYPE "InterestCalculationMethod" AS ENUM ('FLAT_SIMPLE', 'REDUCING_BALANCE');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN "category" "LoanCategory" NOT NULL DEFAULT 'THAVANAI',
ADD COLUMN "interestRate" DECIMAL(6,3),
ADD COLUMN "interestType" "InterestCalculationMethod" DEFAULT 'FLAT_SIMPLE',
ADD COLUMN "collectionDay" INTEGER,
ADD COLUMN "maturityDate" DATE,
ADD COLUMN "principalRepaymentArrangement" TEXT,
ADD COLUMN "unpaidInterestHandling" TEXT DEFAULT 'PENDING_ACCUMULATION',
ALTER COLUMN "totalRepayment" SET DEFAULT 0,
ALTER COLUMN "installmentAmount" SET DEFAULT 0,
ALTER COLUMN "installmentCount" SET DEFAULT 0,
ALTER COLUMN "frequency" SET DEFAULT 'WEEKLY',
ALTER COLUMN "firstDueDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "principalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "interestAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "previousPrincipal" DECIMAL(14,2),
ADD COLUMN "newPrincipal" DECIMAL(14,2),
ADD COLUMN "previousInterest" DECIMAL(14,2),
ADD COLUMN "newInterest" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "InterestPeriod" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "principalBase" DECIMAL(14,2) NOT NULL,
    "interestRate" DECIMAL(6,3) NOT NULL,
    "scheduledAmount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "interestPeriodId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterestPeriod_loanId_sequence_key" ON "InterestPeriod"("loanId", "sequence");

-- CreateIndex
CREATE INDEX "InterestPeriod_loanId_dueDate_idx" ON "InterestPeriod"("loanId", "dueDate");

-- CreateIndex
CREATE INDEX "InterestPeriod_status_dueDate_idx" ON "InterestPeriod"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "InterestAllocation_paymentId_interestPeriodId_key" ON "InterestAllocation"("paymentId", "interestPeriodId");

-- CreateIndex
CREATE INDEX "InterestAllocation_interestPeriodId_idx" ON "InterestAllocation"("interestPeriodId");

-- CreateIndex
CREATE INDEX "Loan_category_status_idx" ON "Loan"("category", "status");

-- CreateIndex
CREATE INDEX "Loan_status_startDate_idx" ON "Loan"("status", "startDate");

-- AddForeignKey
ALTER TABLE "InterestPeriod" ADD CONSTRAINT "InterestPeriod_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestAllocation" ADD CONSTRAINT "InterestAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestAllocation" ADD CONSTRAINT "InterestAllocation_interestPeriodId_fkey" FOREIGN KEY ("interestPeriodId") REFERENCES "InterestPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
