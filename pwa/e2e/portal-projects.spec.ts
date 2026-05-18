import { test, expect } from "@playwright/test";

async function loginAs(page: import("@playwright/test").Page, user: string, pass: string) {
  await page.goto("/login");
  await page.fill('input[name="usr"]', user);
  await page.fill('input[name="pwd"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

const MANAGER_USER = process.env.E2E_MANAGER_USER || "Administrator";
const MANAGER_PASS = process.env.E2E_MANAGER_PASS || "admin";

test.describe("portal projects", () => {
  test("manager sees Projects list", async ({ page }) => {
    await loginAs(page, MANAGER_USER, MANAGER_PASS);
    await page.goto("/portal/projects");
    await expect(page.getByRole("heading", { name: /^Projects$/ })).toBeVisible();
    const firstRow = page.locator(".projects-table tbody tr").first();
    if (await firstRow.count()) {
      await firstRow.click();
      await expect(page.locator(".projects-detail")).toBeVisible();
    }
  });

  test("new project form opens at /portal/projects/new", async ({ page }) => {
    await loginAs(page, MANAGER_USER, MANAGER_PASS);
    await page.goto("/portal/projects/new");
    await expect(page.getByRole("heading", { name: /new project/i })).toBeVisible();
    await expect(page.getByLabel(/title/i)).toBeVisible();
  });
});
