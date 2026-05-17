import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, user: string, pass: string) {
  await page.goto("/login");
  // Frappe login form: support both selector styles seen across versions.
  const userInput = page.locator(
    'input[autocomplete="username"], input[name="usr"]'
  ).first();
  const passInput = page.locator(
    'input[type="password"], input[name="pwd"]'
  ).first();
  await userInput.fill(user);
  await passInput.fill(pass);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

const MANAGER_USER = process.env.E2E_MANAGER_USER || process.env.PWA_TEST_USER || "Administrator";
const MANAGER_PASS = process.env.E2E_MANAGER_PASS || process.env.PWA_TEST_PASS || "admin";
const WORKER_USER = process.env.E2E_WORKER_USER || "";
const WORKER_PASS = process.env.E2E_WORKER_PASS || "";

test.describe("portal shell", () => {
  test("manager lands at /app dashboard and can navigate", async ({ page }) => {
    await loginAs(page, MANAGER_USER, MANAGER_PASS);
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

    await page.getByRole("link", { name: "OKR" }).click();
    await expect(page).toHaveURL(/\/app\/okr/);
    await expect(page.getByText(/okr — coming soon/i)).toBeVisible();
  });

  test("unknown /app route shows NotFound", async ({ page }) => {
    await loginAs(page, MANAGER_USER, MANAGER_PASS);
    await page.goto("/app/this-does-not-exist");
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test("missing permission shows PermissionDenied", async ({ page }) => {
    test.skip(!WORKER_USER, "E2E_WORKER_USER not configured — skipping permission-denied check");
    await loginAs(page, WORKER_USER, WORKER_PASS);
    await page.goto("/app/okr");
    await expect(page.getByText(/permission required/i)).toBeVisible();
  });
});
