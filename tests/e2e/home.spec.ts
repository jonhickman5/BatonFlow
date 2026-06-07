import { expect, test } from "@playwright/test";

test("home page presents the BatonFlow setup surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BatonFlow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prompts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project Updates" })).toBeVisible();
});
