import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

function fail(message: string): never {
  console.error(`\n[admin:setup] ${message}\n`);
  process.exit(1);
}

function validPassword(value: string): boolean {
  return value.length >= 10 && value.length <= 200 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? "Siva Thul Admin").trim() || "Siva Thul Admin";
  const force = process.argv.includes("--force");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("Set ADMIN_EMAIL in .env to a valid email address before running npm run admin:setup.");
  }

  let password = process.env.ADMIN_PASSWORD ?? "";
  let generated = false;
  if (!password) {
    password = `${randomBytes(18).toString("base64url")}a1`;
    generated = true;
  }
  if (!validPassword(password)) {
    fail("ADMIN_PASSWORD must be 10–200 characters and include at least one letter and one number.");
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing && !force) {
    console.log(`[admin:setup] Administrator ${email} already exists. Use --force to reset its password.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = existing
    ? await prisma.admin.update({ where: { id: existing.id }, data: { name, passwordHash } })
    : await prisma.admin.create({ data: { email, name, passwordHash } });

  console.log(`\n[admin:setup] Administrator ${existing ? "updated" : "created"}: ${admin.email} (${admin.name})`);
  if (generated) {
    console.log("\nOne-time generated password (store it now, it will not be shown again):");
    console.log(`\n    ${password}\n`);
    console.log("Sign in and change this password from Settings immediately.");
  } else {
    console.log("Password set from ADMIN_PASSWORD. Remove it from .env after setup.");
  }
}

main()
  .catch((error) => {
    console.error("[admin:setup] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
