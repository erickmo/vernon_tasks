import { test, expect } from "@playwright/test";

const USER = process.env.PWA_TEST_USER ?? "Administrator";
const PASS = process.env.PWA_TEST_PASS ?? "admin";

test("login → My Work renders", async ({ page }) => {
  await page.goto("/m/work");
  await page.fill('input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name: /selamat/i })).toBeVisible({
    timeout: 10_000,
  });
});

test("complete a task triggers undo toast", async ({ page }) => {
  test.skip(!process.env.PWA_E2E_FULL, "Set PWA_E2E_FULL=1 to enable mutation test");

  await page.goto("/m/work");
  await page.fill('input[autocomplete="username"]', USER);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector("h1");

  await page.locator('input[type="checkbox"][aria-label="complete"]').first().click();
  await expect(page.getByText(/Selesai. Batalkan/i)).toBeVisible({ timeout: 5_000 });
});
