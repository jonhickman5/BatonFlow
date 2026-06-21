import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home, { PublicLanding } from "./page";
import { getProjectStore } from "@/lib/project-store";
import { getCurrentUser } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/project-store", () => ({
  getProjectStore: vi.fn(),
}));

vi.mock("@/app/home-ui", () => ({
  SignedInHome: ({ projects, user }: { projects: unknown[]; user: { email: string } }) => (
    <main>
      Signed-in workflow home for {user.email}
      <pre data-testid="signed-in-projects">{JSON.stringify(projects)}</pre>
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
    rotateManagerAccessToken: vi.fn(),
    recordGitHubIssueSync: vi.fn(),
    startManagerCycle: vi.fn(),
    recordManagerReport: vi.fn(),
    markStaleManagerCyclesForProject: vi.fn(),
    markStaleManagerCyclesForOwner: vi.fn(),
  });
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

    render(await Home());

    expect(screen.getByText("Signed-in workflow home for jon@example.com")).toBeInTheDocument();
    expect(getProjectStore().markStaleManagerCyclesForOwner).toHaveBeenCalledWith("user-1");
    expect(getProjectStore().listProjects).toHaveBeenCalledWith("user-1");
    expect(screen.getByTestId("signed-in-projects")).not.toHaveTextContent("github-secret-token");
    expect(screen.getByTestId("signed-in-projects")).toHaveTextContent("hasAccessToken");
  });

  it("renders the public landing from the default home route for guests", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { name: "BatonFlow" })).toBeInTheDocument();
  });
});
