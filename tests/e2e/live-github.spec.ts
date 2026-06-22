import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import type { ManagerNextPrompt, WorkflowProject } from "@/lib/data-structures";
import { fetchGitHubIssues } from "@/lib/github";
import { JsonFileProjectStore } from "@/lib/project-store";
import {
  closeLiveIssue,
  createLiveIssue,
  ensureIssueLabel,
  fetchLiveGitHubUser,
  findE2EUserByEmail,
  listOpenIssuesWithLabel,
  liveGitHubConfig,
  seedGitHubConnection,
  splitRepository,
  setLiveIssueLabels,
} from "./support/live-github";

const liveConfig = liveGitHubConfig();
const e2eBaseURL = process.env.BATONFLOW_BACKEND_URL ?? "http://127.0.0.1:3100";

async function createAccount(page: Page, email: string, password: string, displayName: string) {
  await page.goto("/sign-in", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Sign in to BatonFlow." })).toBeVisible();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create your BatonFlow account." })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: `Good to see you, ${displayName}.` })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Sign in to BatonFlow." })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
}

async function deleteSignedInAccount(page: Page) {
  await page.goto("/account", { timeout: 15_000, waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL("/");
}

function managerHeaders(project: WorkflowProject) {
  return {
    authorization: `Bearer ${project.managerAgent.accessToken}`,
  };
}

async function requestManagerNext(request: APIRequestContext, project: WorkflowProject) {
  const response = await request.post(`/api/projects/${project.id}/manager/next`, {
    data: { managerAgentId: project.managerAgent.id },
    headers: managerHeaders(project),
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  return (await response.json()) as ManagerNextPrompt;
}

async function reportManagerCycle(
  request: APIRequestContext,
  project: WorkflowProject,
  cycleId: string | null,
  terminalSummary: string,
) {
  expect(cycleId).toBeTruthy();

  const response = await request.post(`/api/projects/${project.id}/manager/report`, {
    data: {
      agents: [],
      cycleId,
      managerAgentId: project.managerAgent.id,
      status: "completed",
      stepCount: 0,
      terminalSummary,
    },
    headers: managerHeaders(project),
  });

  expect(response.ok(), await response.text()).toBeTruthy();
}

async function waitForIssueLabels(
  repository: NonNullable<WorkflowProject["repository"]>,
  token: string,
  issueNumber: number,
  expectedLabels: string[],
) {
  await expect
    .poll(
      async () => {
        const issues = await fetchGitHubIssues(repository, token);
        const issue = issues.find((candidate) => candidate.number === issueNumber);

        return expectedLabels.every((label) => issue?.labels.includes(label));
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function newIsolatedPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: e2eBaseURL });
  const page = await context.newPage();

  return { context, page };
}

function stageRegion(page: Page, name: string) {
  return page.getByRole("region", { name: `${name} stage` });
}

function stageRule(stage: ReturnType<typeof stageRegion>, ruleName: "Input rule" | "Output rule") {
  return stage.locator("fieldset").filter({ hasText: ruleName });
}

async function createThreeStageProjectThroughUi(
  page: Page,
  repositoryFullName: string,
  projectTitle: string,
  pendingDoing: string,
  pendingReview: string,
) {
  await page.getByLabel("Project name").fill(projectTitle);
  await page
    .getByLabel("Overall objective")
    .fill("Keep the live GitHub workflow moving through planning, doing, and review.");
  await page.getByRole("combobox", { name: "GitHub repository" }).selectOption(repositoryFullName);

  const review = stageRegion(page, "Review");
  await stageRule(review, "Input rule").getByLabel("Type").selectOption("github_issue");

  const implementation = stageRegion(page, "Implementation");
  await stageRule(implementation, "Input rule").getByLabel("Label/tag").fill(pendingDoing);
  await stageRule(implementation, "Output rule").getByLabel("Type").selectOption("github_issue");
  await stageRule(implementation, "Output rule").getByLabel("Label/tag").fill(pendingReview);
  await implementation.getByLabel("Stage name").fill("Doing");

  await stageRegion(page, "Architecture").getByRole("button", { name: "Remove" }).click();

  const planning = stageRegion(page, "Planning");
  await planning.getByLabel("Priority").fill("3");
  await stageRule(planning, "Output rule").getByLabel("Label/tag").fill(pendingDoing);
  await stageRule(planning, "Output rule").getByLabel("Hold at or above").fill("1");

  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
}

test.describe("live GitHub manager workflow", () => {
  test.setTimeout(120_000);

  test.skip(
    !liveConfig,
    "Set E2E_ALLOW_MUTATING_GITHUB=true and provide E2E_GITHUB_TOKEN or gh auth to run live GitHub workflow.",
  );

  test("drives account isolation and manager stage selection against the scrap repository", async ({
    browser,
    page,
    request,
  }) => {
    const config = liveConfig!;
    splitRepository(config.repository);

    const pendingDoing = "Pending Doing";
    const pendingReview = "Pending Review";
    const existingMatchingIssues = [
      ...(await listOpenIssuesWithLabel(config.token, config.repository, pendingDoing)),
      ...(await listOpenIssuesWithLabel(config.token, config.repository, pendingReview)),
    ];

    test.skip(
      existingMatchingIssues.length > 0,
      `${config.repository} already has open Pending Doing/Review issues; close them or run against a clean disposable repo.`,
    );

    const runId = Date.now();
    const firstEmail = `batonflow-live-${runId}@example.com`;
    const secondEmail = `batonflow-live-isolated-${runId}@example.com`;
    const firstPassword = "first-correct-horse-battery";
    const secondPassword = "second-correct-horse-battery";
    const projectTitle = `Live GitHub ${runId}`;
    let liveIssueNumber: number | null = null;

    try {
      await createAccount(page, firstEmail, firstPassword, "Live GitHub User");
      await deleteSignedInAccount(page);

      await createAccount(page, firstEmail, secondPassword, "Live GitHub User Again");

      const authStorePath = process.env.BATONFLOW_AUTH_STORE_PATH;
      const projectStorePath = process.env.BATONFLOW_PROJECT_STORE_PATH;
      expect(authStorePath).toBeTruthy();
      expect(projectStorePath).toBeTruthy();

      const user = await findE2EUserByEmail(authStorePath!, firstEmail);
      expect(user).toBeTruthy();

      const githubUser = await fetchLiveGitHubUser(config.token);
      await seedGitHubConnection(authStorePath!, user!.id, githubUser, config.token);

      await page.goto("/");
      await expect(page.getByRole("heading", { name: `Connected as ${githubUser.login}` })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "GitHub repository" })).toContainText(
        config.repository,
      );

      const projectStore = new JsonFileProjectStore(projectStorePath!);
      await createThreeStageProjectThroughUi(
        page,
        config.repository,
        projectTitle,
        pendingDoing,
        pendingReview,
      );
      const project = (await projectStore.listProjects(user!.id)).find(
        (candidate) => candidate.title === projectTitle,
      );

      expect(project).toBeTruthy();
      expect(project!.repository?.fullName).toBe(config.repository);
      expect(project!.stages.map((stage) => stage.name).sort()).toEqual([
        "Doing",
        "Planning",
        "Review",
      ]);
      await expect(page.getByRole("button", { name: "Open" })).toBeVisible();

      let nextPrompt = await requestManagerNext(request, project!);
      expect(nextPrompt.decision).toBe("dispatch");
      expect(nextPrompt.selectedStageName).toBe("Planning");
      expect(nextPrompt.prompt).toContain("Selected stage: Planning");
      await reportManagerCycle(request, project!, nextPrompt.cycleId, "Planning e2e prompt inspected.");

      await ensureIssueLabel(config.token, config.repository, pendingDoing);
      await ensureIssueLabel(config.token, config.repository, pendingReview);

      const issue = await createLiveIssue(config.token, config.repository, `BatonFlow live e2e ${runId}`, [
        pendingDoing,
      ]);
      liveIssueNumber = issue.number;
      await waitForIssueLabels(project!.repository!, config.token, liveIssueNumber, [pendingDoing]);

      nextPrompt = await requestManagerNext(request, project!);
      expect(nextPrompt.decision).toBe("dispatch");
      expect(nextPrompt.selectedStageName).toBe("Doing");
      expect(nextPrompt.prompt).toContain("Selected stage: Doing");
      expect(nextPrompt.prompt).toContain(`BatonFlow live e2e ${runId}`);
      await reportManagerCycle(request, project!, nextPrompt.cycleId, "Doing e2e prompt inspected.");

      await setLiveIssueLabels(config.token, config.repository, liveIssueNumber, [pendingReview]);
      await waitForIssueLabels(project!.repository!, config.token, liveIssueNumber, [pendingReview]);

      nextPrompt = await requestManagerNext(request, project!);
      expect(nextPrompt.decision).toBe("dispatch");
      expect(nextPrompt.selectedStageName).toBe("Review");
      expect(nextPrompt.prompt).toContain("Selected stage: Review");
      expect(nextPrompt.prompt).toContain(`BatonFlow live e2e ${runId}`);
      await reportManagerCycle(request, project!, nextPrompt.cycleId, "Review e2e prompt inspected.");
      await closeLiveIssue(config.token, config.repository, liveIssueNumber);
      liveIssueNumber = null;

      await signOut(page);

      const isolated = await newIsolatedPage(browser);
      try {
        await createAccount(isolated.page, secondEmail, "isolated-correct-horse", "Isolated User");
        await expect(
          isolated.page.getByRole("heading", { name: `Connected as ${githubUser.login}` }),
        ).toHaveCount(0);
        await expect(isolated.page.getByRole("heading", { name: projectTitle })).toHaveCount(0);
        await expect(isolated.page.getByText("No projects yet")).toBeVisible();
        await deleteSignedInAccount(isolated.page);
      } finally {
        await isolated.context.close();
      }

      const cleanup = await newIsolatedPage(browser);
      try {
        await signIn(cleanup.page, firstEmail, secondPassword);
        await deleteSignedInAccount(cleanup.page);
      } finally {
        await cleanup.context.close();
      }
    } finally {
      if (liveIssueNumber) {
        await closeLiveIssue(config.token, config.repository, liveIssueNumber);
      }
    }
  });
});
