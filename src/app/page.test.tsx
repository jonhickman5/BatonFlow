import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home, { PublicLanding } from "./page";
import { getAuthStore } from "@/lib/auth-store";
import { fetchGitHubIssues, fetchGitHubRepositories } from "@/lib/github";
import { getProjectStore } from "@/lib/project-store";
import { getCurrentUser } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  getProjectStore: vi.fn(),
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthStore: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  fetchGitHubIssues: vi.fn(),
  fetchGitHubRepositories: vi.fn(),
  getGitHubOAuthConfig: vi.fn(() => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://127.0.0.1:3000/api/github/callback",
  })),
}));

vi.mock("@/app/home-ui", () => ({
  SignedInHome: ({
    githubConnection,
    githubRepositories,
    projects,
    user,
  }: {
    githubConnection: unknown;
    githubRepositories: unknown[];
    projects: unknown[];
    user: { email: string };
  }) => (
    <main>
      Signed-in workflow home for {user.email}
      <pre data-testid="signed-in-projects">{JSON.stringify(projects)}</pre>
      <pre data-testid="github-connection">{JSON.stringify(githubConnection)}</pre>
      <pre data-testid="github-repositories">{JSON.stringify(githubRepositories)}</pre>
    </main>
  ),
}));

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  vi.mocked(getProjectStore).mockReturnValue({
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    deleteProjectsForOwner: vi.fn(),
    rotateManagerAccessToken: vi.fn(),
    recordGitHubIssueSync: vi.fn(),
    startManagerCycle: vi.fn(),
    recordManagerReport: vi.fn(),
    markStaleManagerCyclesForProject: vi.fn(),
    markStaleManagerCyclesForOwner: vi.fn(),
  });
  vi.mocked(getAuthStore).mockReturnValue({
    findUserByNormalizedEmail: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    createSession: vi.fn(),
    findSessionByTokenHash: vi.fn(),
    deleteSessionByTokenHash: vi.fn(),
    getGitHubConnection: vi.fn().mockResolvedValue(null),
    upsertGitHubConnection: vi.fn(),
    deleteGitHubConnection: vi.fn(),
  });
  vi.mocked(fetchGitHubRepositories).mockResolvedValue([]);
  vi.mocked(fetchGitHubIssues).mockResolvedValue([]);
});

describe("Home", () => {
  it("renders the BatonFlow landing surface", () => {
    render(<PublicLanding />);

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Start with an account" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.getByRole("heading", { name: "Workflow canvas coming soon" })).toBeInTheDocument();
  });

  it("renders the signed-in workflow home for authenticated users", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "jon@example.com",
      normalizedEmail: "jon@example.com",
      passwordHash: null,
      emailVerificationStatus: "verified",
      phoneNumber: null,
      displayName: "Jon",
      planType: "free",
      createdAt: "2026-06-21T00:00:00.000Z",
      lastUpdated: "2026-06-21T00:00:00.000Z",
    });

    vi.mocked(getProjectStore().listProjects).mockResolvedValue([
      {
        id: "project-1",
        ownerUserId: "user-1",
        title: "BatonFlow",
        objective: "Coordinate project work.",
        globalInstructionsMarkdown: "# Global",
        repository: {
          provider: "github",
          owner: "jonhickman5",
          name: "BatonFlow",
          url: "https://github.com/jonhickman5/BatonFlow",
          defaultBranch: "main",
          accessToken: "github-secret-token",
          connectedAt: "2026-06-21T00:00:00.000Z",
          lastSyncedAt: null,
          syncError: null,
        },
        settings: {
          maxTaskSteps: 20,
          staleAgentMinutes: 90,
        },
        managerAgent: {
          id: "manager-1",
          name: "Manager",
          projectId: "project-1",
          accessToken: "manager-token",
          createdAt: "2026-06-21T00:00:00.000Z",
          accessTokenUpdatedAt: "2026-06-21T00:00:00.000Z",
        },
        stages: [],
        githubIssueCache: {
          issues: [],
          syncedAt: null,
          error: null,
        },
        managerCycles: [],
        taskAudit: [],
        createdAt: "2026-06-21T00:00:00.000Z",
        lastUpdated: "2026-06-21T00:00:00.000Z",
      },
    ]);
    vi.mocked(getAuthStore().getGitHubConnection).mockResolvedValue({
      userId: "user-1",
      githubUserId: 123,
      login: "jonhickman5",
      name: "Jon",
      avatarUrl: null,
      accessToken: "github-account-secret",
      tokenType: "bearer",
      scope: "repo read:user user:email",
      connectedAt: "2026-06-21T00:00:00.000Z",
      lastUpdated: "2026-06-21T00:00:00.000Z",
    });
    vi.mocked(fetchGitHubRepositories).mockResolvedValue([
      {
        id: 456,
        owner: "jonhickman5",
        name: "BatonFlow",
        fullName: "jonhickman5/BatonFlow",
        url: "https://github.com/jonhickman5/BatonFlow",
        private: true,
        defaultBranch: "main",
        updatedAt: "2026-06-21T00:00:00.000Z",
        permissions: {
          admin: true,
          maintain: true,
          push: true,
          triage: true,
          pull: true,
        },
      },
    ]);

    render(await Home());

    expect(screen.getByText("Signed-in workflow home for jon@example.com")).toBeInTheDocument();
    expect(getProjectStore().markStaleManagerCyclesForOwner).toHaveBeenCalledWith("user-1");
    expect(getProjectStore().listProjects).toHaveBeenCalledWith("user-1");
    expect(fetchGitHubIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "jonhickman5",
        name: "BatonFlow",
      }),
      "github-account-secret",
    );
    expect(screen.getByTestId("signed-in-projects")).not.toHaveTextContent("github-secret-token");
    expect(screen.getByTestId("signed-in-projects")).toHaveTextContent("hasAccessToken");
    expect(screen.getByTestId("github-connection")).not.toHaveTextContent("github-account-secret");
    expect(screen.getByTestId("github-connection")).toHaveTextContent("jonhickman5");
    expect(screen.getByTestId("github-repositories")).toHaveTextContent("jonhickman5/BatonFlow");
  });

  it("renders a repository sync error without passing stale issues to the dashboard", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "jon@example.com",
      normalizedEmail: "jon@example.com",
      passwordHash: null,
      emailVerificationStatus: "verified",
      phoneNumber: null,
      displayName: "Jon",
      planType: "free",
      createdAt: "2026-06-21T00:00:00.000Z",
      lastUpdated: "2026-06-21T00:00:00.000Z",
    });
    vi.mocked(getAuthStore().getGitHubConnection).mockResolvedValue({
      userId: "user-1",
      githubUserId: 123,
      login: "jonhickman5",
      name: "Jon",
      avatarUrl: null,
      accessToken: "github-account-secret",
      tokenType: "bearer",
      scope: "repo read:user user:email",
      connectedAt: "2026-06-21T00:00:00.000Z",
      lastUpdated: "2026-06-21T00:00:00.000Z",
    });
    vi.mocked(getProjectStore().listProjects).mockResolvedValue([
      {
        id: "project-1",
        ownerUserId: "user-1",
        title: "BatonFlow",
        objective: "Coordinate project work.",
        globalInstructionsMarkdown: "# Global",
        repository: {
          provider: "github",
          owner: "jonhickman5",
          name: "BatonFlow",
          url: "https://github.com/jonhickman5/BatonFlow",
          defaultBranch: "main",
          connectedAt: "2026-06-21T00:00:00.000Z",
          lastSyncedAt: "2026-06-21T00:00:00.000Z",
          syncError: null,
        },
        settings: {
          maxTaskSteps: 20,
          staleAgentMinutes: 90,
        },
        managerAgent: {
          id: "manager-1",
          name: "Manager",
          projectId: "project-1",
          accessToken: "manager-token",
          createdAt: "2026-06-21T00:00:00.000Z",
          accessTokenUpdatedAt: "2026-06-21T00:00:00.000Z",
        },
        stages: [],
        githubIssueCache: {
          issues: [
            {
              id: "issue-1",
              number: 1,
              title: "Stale cached issue",
              url: "https://github.com/jonhickman5/BatonFlow/issues/1",
              state: "open",
              labels: ["Pending Doing"],
              assignees: [],
              createdAt: "2026-06-21T00:00:00.000Z",
              updatedAt: "2026-06-21T00:00:00.000Z",
              eligibleStageIds: [],
            },
          ],
          syncedAt: "2026-06-21T00:00:00.000Z",
          error: null,
        },
        managerCycles: [],
        taskAudit: [],
        createdAt: "2026-06-21T00:00:00.000Z",
        lastUpdated: "2026-06-21T00:00:00.000Z",
      },
    ]);
    vi.mocked(fetchGitHubIssues).mockRejectedValue(new Error("GitHub issue sync failed with 401."));

    render(await Home());

    expect(screen.getByTestId("signed-in-projects")).toHaveTextContent(
      "GitHub issue sync failed with 401.",
    );
    expect(screen.getByTestId("signed-in-projects")).not.toHaveTextContent("Stale cached issue");
  });

  it("renders the public landing from the default home route for guests", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
  });
});
