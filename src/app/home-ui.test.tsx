import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignedInHome } from "./home-ui";
import {
  sanitizeWorkflowProjectForClient,
  type ClientGitHubAccountConnection,
  type GitHubRepositorySummary,
  type WorkflowProject,
} from "@/lib/data-structures";

vi.mock("@/app/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/app/project-actions", () => ({
  createWorkflowProjectAction: vi.fn(async () => ({ message: "Project created." })),
  deleteWorkflowProjectAction: vi.fn(),
  rotateManagerAccessTokenAction: vi.fn(),
  updateWorkflowProjectAction: vi.fn(async () => ({ message: "Project saved." })),
}));

const workflowProject: WorkflowProject = {
  id: "project-1",
  ownerUserId: "user-1",
  title: "GameGlass",
  objective: "Keep GameGlass workflow items moving.",
  globalInstructionsMarkdown: "# Global\n\nCheck leases first.",
  repository: {
    provider: "github",
    owner: "jonhickman5",
    name: "GameGlass",
    url: "https://github.com/jonhickman5/GameGlass",
    defaultBranch: "main",
    accessToken: "github-secret-token",
    connectedAt: "2026-06-21T00:00:00.000Z",
    lastSyncedAt: "2026-06-21T00:10:00.000Z",
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
    accessToken: "bfm_test-token",
    createdAt: "2026-06-21T00:00:00.000Z",
    accessTokenUpdatedAt: "2026-06-21T00:00:00.000Z",
  },
  stages: [
    {
      id: "implementation",
      name: "Implementation",
      priority: 1,
      instructionsMarkdown: "# Implementation\n\nShip one issue.",
      input: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Implementation",
        minimumReady: 1,
      },
      output: {
        kind: "github_pull_request",
        status: "Open",
        label: "Pending Review",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 1,
      },
    },
  ],
  githubIssueCache: {
    syncedAt: "2026-06-21T00:10:00.000Z",
    error: null,
    issues: [
      {
        id: "issue-1",
        number: 42,
        title: "Implement repository dashboard",
        url: "https://github.com/jonhickman5/GameGlass/issues/42",
        state: "open",
        labels: ["Pending Implementation"],
        assignees: ["jon"],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:10:00.000Z",
        eligibleStageIds: ["implementation"],
      },
    ],
  },
  managerCycles: [
    {
      id: "cycle-1",
      managerAgentId: "manager-1",
      stageId: "implementation",
      stageName: "Implementation",
      taskKey: "github_issue:42",
      taskTitle: "Implement repository dashboard",
      taskUrl: "https://github.com/jonhickman5/GameGlass/issues/42",
      status: "failed",
      prompt: "Do implementation.",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:15:00.000Z",
      completedAt: "2026-06-21T00:15:00.000Z",
      lastHeartbeatAt: "2026-06-21T00:15:00.000Z",
      maxSteps: 20,
      stepCount: 8,
      agents: [
        {
          id: "agent-1",
          name: "Implementation subagent",
          stageId: "implementation",
          stageName: "Implementation",
          taskKey: "github_issue:42",
          taskTitle: "Implement repository dashboard",
          taskUrl: "https://github.com/jonhickman5/GameGlass/issues/42",
          status: "crashed",
          terminalState: "Process exited unexpectedly.",
          startedAt: "2026-06-21T00:00:00.000Z",
          completedAt: "2026-06-21T00:15:00.000Z",
          durationMs: 900000,
          stepCount: 8,
          failureReason: "Agent crashed.",
        },
      ],
      failureReason: "Subagent crashed.",
      terminalSummary: "Crash observed.",
    },
  ],
  taskAudit: [
    {
      id: "audit-1",
      cycleId: "cycle-1",
      agentId: "agent-1",
      taskKey: "github_issue:42",
      taskTitle: "Implement repository dashboard",
      taskUrl: "https://github.com/jonhickman5/GameGlass/issues/42",
      stageId: "implementation",
      stageName: "Implementation",
      type: "agent_reported",
      summary: "Subagent crashed.",
      createdAt: "2026-06-21T00:15:00.000Z",
      durationMs: 900000,
      stepCount: 8,
      status: "crashed",
    },
  ],
  createdAt: "2026-06-21T00:00:00.000Z",
  lastUpdated: "2026-06-21T00:00:00.000Z",
};
const sanitizedWorkflowProject = sanitizeWorkflowProjectForClient(workflowProject);
const githubConnection: ClientGitHubAccountConnection = {
  userId: "user-1",
  githubUserId: 123,
  login: "jonhickman5",
  name: "Jon Hickman",
  avatarUrl: "https://avatars.githubusercontent.com/u/123",
  tokenType: "bearer",
  scope: "repo read:user user:email",
  scopes: ["repo", "read:user", "user:email"],
  connectedAt: "2026-06-21T00:00:00.000Z",
  lastUpdated: "2026-06-21T00:00:00.000Z",
};
const githubRepositories: GitHubRepositorySummary[] = [
  {
    id: 101,
    owner: "jonhickman5",
    name: "GameGlass",
    fullName: "jonhickman5/GameGlass",
    url: "https://github.com/jonhickman5/GameGlass",
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
];

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("SignedInHome", () => {
  it("renders the project creation workflow with default stage agents", () => {
    render(
      <SignedInHome
        backendUrl="http://127.0.0.1:3000"
        githubConnection={null}
        githubOAuthConfigured={true}
        githubRepositories={[]}
        githubRepositoryError={null}
        projects={[]}
        user={{ displayName: "Jon", email: "jon@example.com" }}
      />,
    );

    expect(screen.getByRole("heading", { name: /Good to see you, Jon/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
    expect(screen.getByText("global-instructions.md")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Planning stage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in with GitHub" })).toHaveAttribute(
      "href",
      "/api/github/connect",
    );
    expect(screen.queryByLabelText("GitHub token")).not.toBeInTheDocument();
    expect(screen.getByText("No projects yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add stage" }));

    expect(screen.getByRole("region", { name: "Stage 5 stage" })).toBeInTheDocument();
  });

  it("renders saved projects and copies the manager prompt", async () => {
    render(
      <SignedInHome
        backendUrl="http://localhost:3000"
        githubConnection={githubConnection}
        githubOAuthConfigured={true}
        githubRepositories={githubRepositories}
        githubRepositoryError={null}
        projects={[sanitizedWorkflowProject]}
        user={{ displayName: null, email: "jon@example.com" }}
      />,
    );

    const projectCard = screen.getByRole("heading", { name: "GameGlass" }).closest(".project-card");

    expect(projectCard).not.toBeNull();

    const card = within(projectCard as HTMLElement);

    expect(card.getByRole("heading", { name: "GameGlass" })).toBeInTheDocument();
    expect(card.getAllByText("1. Implementation").length).toBeGreaterThan(0);
    expect(card.getByText("jonhickman5/GameGlass")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected as jonhickman5" })).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Open" }));

    expect(card.getAllByText(/Implement repository dashboard/).length).toBeGreaterThan(0);
    expect(card.getAllByText("Subagent crashed.").length).toBeGreaterThan(0);
    expect(card.getByText("Implementation subagent")).toBeInTheDocument();
    expect(card.getByText("Process exited unexpectedly.")).toBeInTheDocument();
    expect(card.getByText(/crashed · 8 steps · 15m 0s/)).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: "Edit" }));

    expect(screen.getAllByRole("combobox", { name: "GitHub repository" })[1]).toHaveValue(
      "jonhickman5/GameGlass",
    );
    expect(card.getByRole("button", { name: "Delete project" })).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Rotate token" })).toBeInTheDocument();
    expect(card.queryByText("github-secret-token")).not.toBeInTheDocument();
    expect(JSON.stringify(sanitizedWorkflowProject)).not.toContain("github-secret-token");

    fireEvent.click(card.getByRole("button", { name: "Copy manager prompt" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/project-1/manager/next"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Authorization: Bearer bfm_test-token"),
    );
  });
});
