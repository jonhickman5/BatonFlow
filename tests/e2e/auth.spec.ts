import { expect, test } from "@playwright/test";

test("create account form uses email identity and shows live password mismatch", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByRole("tab", { name: "Create account" }).click();

  const emailInput = page.getByLabel("Email");
  await expect(emailInput).toHaveAttribute("name", "email");
  await expect(emailInput).toHaveAttribute("type", "email");
  await expect(emailInput).toHaveAttribute("autocomplete", "email");

  await page.getByLabel("Password", { exact: true }).fill("alpha-password");
  await page.getByLabel("Confirm password").fill("beta-password");

  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
});
