# Siva Thul Finance

A private, mobile-first loan and finance management platform supporting **Three Independent Loan Categories**:
1. **THAVANAI** (Installment Loan — Daily / Weekly / Monthly fixed installments)
2. **VATTI** (Monthly Interest Loan — Admin-configured monthly interest rate, flat or reducing balance)
3. **RUN VATI** (Weekly Interest Loan — Admin-configured weekly interest rate, flat or reducing balance)

Customers can maintain multiple independent accounts across all three categories simultaneously without mixing financial calculations or balances.

There is no public registration, no customer portal, and no payment gateway. All collections are entered manually by the administrator with immutable audit ledgers.

---

## Core Business Categories

### A. Thavanai (Installment Loan)
- **Concept**: Contractual fixed installment repayment.
- **Admin Configuration**:
  - Nominal loan amount
  - Upfront deduction
  - Net cash disbursed ($P_{disbursed} = P_{nominal} - \text{Deduction}$)
  - Total contractual repayment commitment
  - Frequency (Daily, Weekly, Monthly)
  - Installment amount & count
  - Start date & First due date
- **Balances**: Outstanding balance is Contractual Repayment minus Collected.
- **Allocation**: Payments allocate to oldest unpaid installments first. Final installment absorbs rounding remainders.

### B. Vatti (Monthly Interest Loan)
- **Concept**: Monthly interest-based loan with flexible interest and principal repayment.
- **Admin Configuration**:
  - Principal amount
  - Monthly interest rate percentage (%)
  - Calculation method: Flat Simple (on original principal) or Reducing Balance (on outstanding principal)
  - Monthly collection day (1–31)
  - Loan start date & optional maturity date
  - Principal repayment arrangement & unpaid interest handling
- **Rules**:
  - Monthly interest payments NEVER reduce the principal.
  - Remaining Principal = Original Principal - Total Principal Repaid.
  - Actual Cash Disbursed = Original Principal - Upfront Deduction.
  - Loan becomes CLOSED only when the full principal is repaid.
- **Payments**: Supports Interest-only, Principal-only, Combined interest+principal, and Full loan settlement.

### C. Run Vati (Weekly Interest Loan)
- **Concept**: Weekly interest-based loan with flexible interest and principal repayment.
- **Admin Configuration**:
  - Principal amount
  - Weekly interest rate percentage (%) — **Always entered by administrator**
  - Calculation method: Flat Simple or Reducing Balance
  - Weekly collection day (0 = Sunday, 1 = Monday, ... 6 = Saturday)
  - Loan start date & optional maturity date
- **Rules**:
  - Customer pays interest every week.
  - Weekly interest payments NEVER reduce the principal.
  - Remaining Principal = Original Principal - Total Principal Repaid.
  - Actual Cash Disbursed = Original Principal - Upfront Deduction.
  - Loan becomes CLOSED only when the full principal is repaid.
- **Payments**: Supports Interest-only, Principal-only, Combined, and Full settlement payments.

---

## Customer Multi-Loan Management

- **Single Customer, Unlimited Accounts**: A single customer (e.g., *Sivaprabhu*) can take Thavanai, Vatti, and Run Vati loans at the same time.
- **Isolated Accounts**: Each loan maintains its own account reference (`TM-L...` for Thavanai, `TM-V...` for Vatti, `TM-RV...` for Run Vati).
- **Customer Profile Overview**:
  - 8 aggregate summary stats: Total Principal Disbursed, Total Collected, Outstanding Principal, Outstanding Interest, Total Outstanding Balance, Active Loans count, Overdue Amount, Total Loans count.
  - Category tabs (`[All Loans]`, `[Thavanai]`, `[Vatti]`, `[Run Vati]`).
  - **Chronological Combined Customer Ledger**: Complete transaction history showing every receipt across all three categories with principal and interest breakdowns.
- **Quick Loan Creation**: When creating a customer, the admin can optionally create and activate their first loan immediately.

---

## Dashboard — Category-Isolated Sections

The dashboard provides clear navigation tabs to view portfolio health without mixing financial formulas:
1. **Overall Portfolio**: Total unique customers, active loans, total cash disbursed, total collected, total outstanding balance, total overdue, today's collection, this month's collection, and trend charts.
2. **Thavanai Dashboard**: Total Thavanai loans, disbursed cash, repayment commitment, collected amount, remaining repayment balance, today's installments, overdue installments, and gross margin.
3. **Monthly Vatti Dashboard**: Active monthly-interest loans, principal disbursed, outstanding principal, interest accrued, interest collected, pending interest, today's/month's interest collections, and overdue cycles.
4. **Run Vati Dashboard**: Active weekly-interest loans, principal disbursed, outstanding principal, weekly interest accrued, interest collected, pending interest, this week's collections, and overdue cycles.
5. **All Accounts View**: Unified table with category badges, principal/installment terms, and collection status.

---

## Manual Collection & Ledger Integrity

- **Strictly Manual**: No payment gateways, no online UPI processing. All entries reflect physical cash or offline transfers.
- **Adaptive Payment Form**:
  - For Thavanai: Quick-fill installment amount, allocated oldest-first.
  - For Vatti & Run Vati: Quick actions for **Interest Only**, **Principal Only**, **Full Settlement**, or **Custom Principal + Interest breakdown**.
- **Immutable Receipts & Ledger**:
  - Unique receipt numbers (`TM-R2026-XXXX`).
  - Pre-payment and post-payment balance snapshots (`previousPrincipal -> newPrincipal`, `previousInterest -> newInterest`).
  - Reversals: Posted receipts are never silently edited. Reversing a payment creates an auditable reversal record and restores installment/period balances automatically.
- **Category-Specific WhatsApp Receipts**:
  - Detailed receipt text formatted for WhatsApp.
  - Direct WhatsApp deep-link (`https://wa.me/...`).
  - One-click PDF receipt and statement downloads.

---

## Reports & 6-Sheet Excel Workbook

Generate server-side Excel workbooks (`.xlsx`) on demand:
1. **Overall Summary Sheet**: High-level portfolio metrics, cash disbursed, total collected, and category breakdown.
2. **Thavanai Loans Sheet**: Nominal amount, deduction, net cash disbursed, contractual repayment, collected, remaining balance, and margin.
3. **Vatti Loans Sheet**: Principal amount, monthly interest %, calculation method, collection day, principal paid, outstanding principal, interest accrued, interest collected, pending interest, and overdue cycles.
4. **Run Vati Loans Sheet**: Principal amount, weekly interest %, calculation method, weekly collection day, principal paid, outstanding principal, weekly interest accrued, interest collected, pending interest, and overdue cycles.
5. **Payment Collections Sheet**: Every posted collection with receipt number, customer, loan category, amount, principal portion, interest portion, payment mode, and date.
6. **Outstanding Balances Sheet**: Customer-wise total exposure broken down into Thavanai repayment, Vatti principal, Vatti interest, Run Vati principal, Run Vati interest, and total outstanding.

---

## Tech Stack & Architecture

- **Framework**: Next.js 15 (App Router, Server Actions, React 19).
- **Database**: Neon PostgreSQL via Prisma ORM.
- **Language**: TypeScript (Strict).
- **Styling**: Tailwind CSS v3 with dark mode and accessibility tokens.
- **Calculations**: `decimal.js` for arbitrary-precision financial arithmetic.
