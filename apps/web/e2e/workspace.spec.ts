import { test, expect } from "@playwright/test";

test("workspace renders with Cmd-K palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("scopium")).toBeVisible();
  await expect(page.getByText("Ask Scopium")).toBeVisible();

  await page.getByText("Ask Scopium").click();
  await expect(page.getByPlaceholder(/companies were registered/i)).toBeVisible();
});

test("view tabs swap content area", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Table", "Map", "Timeline", "Graph"]) {
    await page.getByRole("button", { name: tab }).click();
  }
});
