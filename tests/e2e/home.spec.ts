import { expect, test } from "@playwright/test";

test("home page presents the BatonFlow landing surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BatonFlow" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  await expect(page.getByRole("heading", { name: "Workflow canvas coming soon" })).toBeVisible();
});
