import { test, expect } from "@playwright/test";

test("person search page renders with search and sweep", async ({ page }) => {
  await page.goto("/person");
  await expect(page.getByText("Who is…")).toBeVisible();
  await expect(page.getByPlaceholder(/Jane Smith/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sweep sources/i })).toBeVisible();
});

test("workspace links to person search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Who is/i })).toBeVisible();
});
