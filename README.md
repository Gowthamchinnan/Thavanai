# Thavanai Manager

A private, mobile-first loan and installment collection manager for a single lender. Track customers, build daily/weekly/monthly schedules, record manual cash collections, follow overdue installments, generate PDF receipts and statements, share WhatsApp messages and export Excel reports.

There is no public registration, no customer portal and no payment gateway. All collections are entered manually by the administrator.

## Features

- **Single administrator** — credentials login, Argon2id password hashing, login rate limiting, JWT sessions.
- **Customers** — searchable ledger with archived customers, balances and payment history.
- **Flexible loans** — nominal amount, upfront deduction, contractual repayment total and installment count are independent.
- **Schedules** — daily, weekly or monthly; monthly dates clamp to short months; the final installment absorbs rounding remainders.
- **Collections** — due today, overdue and upcoming views with oldest-first payment allocation.
- **Payments** — idempotent recording, overpayment protection, void/reversal with audit trail and automatic loan completion.
- **Documents** — server-generated PDF receipts and loan statements, WhatsApp text prefills, Excel exports.
- **Reports & settings** — portfolio summaries, collection trends, business/receipt settings and password changes.
- **Auditability** — every financial mutation writes an audit log entry.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 6 · PostgreSQL · Auth.js (NextAuth 5) · Zod · React Hook Form · PDFKit · ExcelJS · Recharts · Vitest · Playwright

## Requirements

- Node.js 20+ (tested with Node 24)
- npm 10+
- PostgreSQL 15+ (tested with PostgreSQL 17)
- PowerShell on Windows (commands below), or any shell with equivalent environment variables

## Setup (Windows PowerShell)

### 1. Create the databases

Using `psql` from your PostgreSQL installation:

```powershell
$env:PGPASSWORD = "your-postgres-password"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c 'CREATE DATABASE thavanai;'
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c 'CREATE DATABASE thavanai_test;'
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c 'CREATE DATABASE thavanai_e2e;'
Remove-Item Env:PGPASSWORD
```

For a local trust-auth server you can omit the password entirely. Use whatever host/port your server listens on.

### 2. Configure environment variables

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set at least:

```dotenv
DATABASE_URL="postgresql://neondb_owner:npg_uS2ktJYWg7Fp@ep-empty-pine-be4y9gq8-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
AUTH_SECRET="<long random secret>"
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_NAME="Thavanai Admin"
TEST_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/thavanai_test?schema=public"
E2E_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/thavanai_e2e?schema=public"
```

Generate a secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`DATABASE_URL` is required at runtime. `TEST_DATABASE_URL` and `E2E_DATABASE_URL` are only needed for the integration and end-to-end suites. Integration tests refuse to run against a database whose name does not contain `_test`.

### 3. Install and migrate

```powershell
npm install
npm run db:deploy
npm run db:seed
```

`db:deploy` applies committed migrations. During local schema work use `npm run db:migrate` instead.

`db:seed` creates the singleton settings row. To also insert demo data (demo admin, customer and loan), set `SEED_DEMO_DATA` for one run:

```powershell
$env:SEED_DEMO_DATA = "true"
npm run db:seed
Remove-Item Env:SEED_DEMO_DATA
```

### 4. Create the administrator

```powershell
npm run admin:setup
```

- If `ADMIN_PASSWORD` is not set, the script prints a generated one-time password. Store it immediately.
- To choose the password yourself, set it only for the setup command:

```powershell
$env:ADMIN_PASSWORD = "A-strong-password1"
npm run admin:setup
Remove-Item Env:ADMIN_PASSWORD
```

Use `npm run admin:setup -- --force` to reset the existing administrator's password. Passwords must be 10–200 characters and contain at least one letter and one number.

### 5. Run

```powershell
npm run dev
```

Open <http://localhost:3000> and sign in with the administrator email and password.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by the app and Prisma. |
| `AUTH_SECRET` | Yes | Signs/encrypts session cookies. Use a long random value and never reuse the example. |
| `AUTH_TRUST_HOST` | Recommended | Set to `true` behind a reverse proxy or when the public origin differs from the bind address. |
| `NEXTAUTH_URL` | Production | Public origin, e.g. `https://loans.example.com`. Affects cookies and redirects. |
| `ADMIN_EMAIL` / `ADMIN_NAME` | Setup | Used by `db:seed` and `admin:setup`. |
| `ADMIN_PASSWORD` | Optional | One-time password for `admin:setup`. Remove it afterwards. |
| `BUSINESS_NAME` | Optional | Initial business name written by `db:seed`. |
| `SEED_DEMO_DATA` | Optional | Set to `true` to insert demo records during seeding. |
| `TEST_DATABASE_URL` | Tests | Database for Vitest integration tests (name must contain `_test`). |
| `E2E_DATABASE_URL` | Tests | Database for Playwright; it is reset before each run. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server on port 3000. |
| `npm run build` | Generate Prisma Client and create an optimized production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run db:generate` | Regenerate Prisma Client. |
| `npm run db:migrate` | Create/apply a development migration. |
| `npm run db:deploy` | Apply committed migrations (production). |
| `npm run db:seed` | Ensure settings and optionally seed demo data. |
| `npm run db:studio` | Open Prisma Studio. |
| `npm run admin:setup` | Create or reset the single administrator. |
| `npm run test` | Run all Vitest suites. |
| `npm run test:unit` | Run unit tests only. |
| `npm run test:integration` | Run database integration tests. |
| `npm run test:e2e` | Run the Playwright workflow against a production build. |

## Testing

Unit tests:

```powershell
npm run test:unit
```

Integration tests (uses `TEST_DATABASE_URL`):

```powershell
npm run test:integration
```

End-to-end tests (uses `E2E_DATABASE_URL`):

```powershell
npx playwright install chromium
npm run test:e2e
```

Playwright:

- resets the e2e database and creates a dedicated administrator (`e2e@thavanai.test`),
- builds the app into `.next-e2e` and serves it on `http://127.0.0.1:3100`, so it can run alongside a dev server on port 3000,
- exercises login, customer creation, loan creation and a cash collection.

## Business rules

- Money is handled as fixed 2-decimal values using Prisma `Decimal`/strings; dates are stored at UTC midnight for Asia/Kolkata calendar days.
- The first due date is supplied explicitly; later dates follow the chosen frequency with end-of-month clamping.
- The final installment absorbs any remainder so scheduled amounts always equal the contractual repayment total.
- Payments allocate oldest installment first. Overpayment beyond the outstanding balance is rejected.
- Payments are written in serializable transactions with row locking; each payment carries a unique idempotency key.
- Voiding a payment creates a reversal and audit entries; loans complete automatically when fully collected.
- Customers with active or draft loans cannot be archived.

## Backups

Take a logical backup before upgrades:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -F c -f "D:\backups\thavanai.dump" thavanai
```

Restore into an empty database:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -d thavanai "D:\backups\thavanai.dump"
```

Store backups somewhere separate from the application host and schedule them with Task Scheduler or your hosting provider.

## Production deployment

```powershell
npm ci
npm run db:deploy
npm run db:seed
npm run build
npm run start
```

- Set `NODE_ENV=production`, a strong `AUTH_SECRET`, and `NEXTAUTH_URL` to the public HTTPS origin.
- Terminate TLS at a reverse proxy (nginx, Caddy, IIS ARR) and set `AUTH_TRUST_HOST=true`.
- Run `admin:setup` once (preferably with a one-time `ADMIN_PASSWORD`).
- Do not expose PostgreSQL publicly; restrict it to the application host.
- PDF routes bundle the fonts in `assets/fonts`; keep that folder when deploying the build output.

## Troubleshooting

- **`EPERM ... query_engine-windows.dll.node` during `prisma generate`** — another Node process (often a running dev server) holds the Prisma engine. Stop dev servers before `npm run build`, or use a separate Windows user/checkout for builds.
- **Port 3000 already in use** — stop the other server or set `PORT` (e.g. `$env:PORT="3001"; npm run start`) and update `NEXTAUTH_URL`.
- **Login redirects back to `/login`** — verify `AUTH_SECRET`, `AUTH_TRUST_HOST`, `NEXTAUTH_URL`, and that the system clock is correct.
- **Integration tests refuse to run** — the target database name must contain `_test`; set `TEST_DATABASE_URL` accordingly.
- **E2E cannot start** — port 3100 must be free, and `npx playwright install chromium` must have been run.
