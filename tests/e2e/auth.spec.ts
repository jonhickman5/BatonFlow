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

test("creates an account and lands on the signed-in home", async ({ page }) => {
  const serverErrors: string[] = [];

  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();

  const email = `playwright-${Date.now()}@example.com`;

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill("Playwright User");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password").fill("correct-horse-battery-staple");

  const createAccountButton = page.getByRole("button", { name: "Create account" });
  await expect(createAccountButton).toBeEnabled();
  await createAccountButton.click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Good to see you, Playwright User." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GitHub connection" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with GitHub" })).toHaveAttribute(
    "href",
    "/api/github/connect",
  );
  await expect(page.getByLabel("GitHub token")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Workflow configuration" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();

  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill("Playwright User Again");
  await page.getByLabel("Password", { exact: true }).fill("different-correct-horse");
  await page.getByLabel("Confirm password").fill("different-correct-horse");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Good to see you, Playwright User Again." })).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL("/");

  expect(serverErrors).toEqual([]);
});
