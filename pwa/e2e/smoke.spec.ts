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
