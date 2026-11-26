import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./global-setup";

test.describe("single-admin loan workflow", () => {
  test("redirects anonymous visitors to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in|administrator/i })).toBeVisible();
  });

  test("signs in, creates a customer and loan, and records a collection", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(E2E_EMAIL);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto("/customers/new");
    await page.getByLabel("Full name").fill("Playwright Customer");
    await page.getByLabel("Mobile number").fill("9876543210");
    await page.getByRole("button", { name: "Create customer" }).click();
    await expect(page).toHaveURL(/\/customers\/[a-z0-9]{20,}$/);
    await expect(page.getByRole("heading", { name: "Playwright Customer" })).toBeVisible();
    const customerUrl = page.url();

    await page.goto("/loans/new");
    await page.locator("#customerId").selectOption({ index: 1 });
    await page.locator("#nominalAmount").fill("3000.00");
    await page.locator("#deductionAmount").fill("400.00");
    await expect(page.locator("#totalRepayment")).toHaveValue("3000.00");
    await expect(page.locator("#totalRepayment")).toHaveAttribute("readonly", "");
    await page.locator("#installmentAmount").fill("1000.00");
    await page.getByRole("button", { name: "Create Thavanai loan" }).click();
    await expect(page).toHaveURL(/\/loans\/[a-z0-9]{20,}$/, { timeout: 30_000 });
    await expect(page.getByText("Contractual repayment", { exact: true })).toBeVisible();

    await page.locator("#amount").fill("1000.00");
    await page.getByRole("button", { name: /record payment/i }).click();
    await expect(page.getByText(/Payment recorded/i).first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/payments");
    await expect(page.getByText("Playwright Customer").first()).toBeVisible();
    await page.goto(customerUrl);
    await expect(page.getByRole("heading", { name: "Playwright Customer" })).toBeVisible();
  });
});
