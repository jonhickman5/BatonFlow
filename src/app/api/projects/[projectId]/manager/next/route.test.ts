import { describe, expect, it, vi } from "vitest";
import type { WorkflowProject } from "@/lib/data-structures";
import { getProjectStore } from "@/lib/project-store";
import type { ProjectStore } from "@/lib/project-store";
import { POST } from "./route";

vi.mock("@/lib/project-store", () => ({
  getProjectStore: vi.fn(),
}));

const workflowProject: WorkflowProject = {
  id: "project-1",
  ownerUserId: "user-1",
  title: "GameGlass",
  objective: "Keep the workflow moving.",
  globalInstructionsMarkdown: "# Global\n\nCheck leases.",
  repository: null,
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
      id: "planning",
      name: "Planning",
      priority: 2,
      instructionsMarkdown: "# Planning\n\nCreate issues.",
      input: null,
      output: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Architecture",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 3,
      },
    },
    {
      id: "architecture",
      name: "Architecture",
      priority: 1,
      instructionsMarkdown: "# Architecture\n\nWrite plans.",
      input: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Architecture",
        minimumReady: 1,
      },
      output: {
        kind: "github_issue",
        status: "Open",
        label: "Pending Implementation",
        refillWhenAtOrBelow: 0,
        holdWhenAtOrAbove: 1,
      },
    },
  ],
  githubIssueCache: {
    syncedAt: "2026-06-21T00:00:00.000Z",
    error: null,
    issues: [
      {
        id: "issue-1",
        number: 1,
        title: "Architecture ready",
        url: "https://github.com/jonhickman5/GameGlass/issues/1",
        state: "open",
        labels: ["Pending Architecture"],
        assignees: [],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
        eligibleStageIds: ["architecture"],
      },
    ],
  },
  managerCycles: [],
  taskAudit: [],
  createdAt: "2026-06-21T00:00:00.000Z",
  lastUpdated: "2026-06-21T00:00:00.000Z",
};

function request(body: unknown, token = "bfm_test-token") {
  return new Request("http://localhost/api/projects/project-1/manager/next", {
    body: JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    method: "POST",
  });
}

function context(projectId = "project-1") {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function mockProjectStore(getProject = vi.fn().mockResolvedValue(workflowProject)) {
  const store: ProjectStore = {
    listProjects: vi.fn(),
    getProject,
    createProject: vi.fn(),
    updateProject: vi.fn(),
    rotateManagerAccessToken: vi.fn(),
    recordGitHubIssueSync: vi.fn(),
    startManagerCycle: vi.fn().mockResolvedValue(workflowProject),
    recordManagerReport: vi.fn(),
    markStaleManagerCyclesForProject: vi.fn().mockResolvedValue(workflowProject),
    markStaleManagerCyclesForOwner: vi.fn(),
  };

  vi.mocked(getProjectStore).mockReturnValue(store);
  return store;
}

describe("POST /api/projects/[projectId]/manager/next", () => {
  it("returns a next prompt using runtime resource counts", async () => {
    const store = mockProjectStore();

    const response = await POST(
      request({
        managerAgentId: "manager-1",
      }),
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedStageName).toBe("Architecture");
    expect(body.taskKey).toBe("github_issue:1");
    expect(body.prompt).toContain("# Architecture");
    expect(store.startManagerCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleId: body.cycleId,
        taskKey: "github_issue:1",
      }),
    );
  });

  it("rejects missing projects, wrong manager ids, missing counts, and invalid JSON", async () => {
    const getProject = vi.fn().mockResolvedValue(null);

    mockProjectStore(getProject);

    await expect(POST(request({ managerAgentId: "manager-1" }), context())).resolves
      .toHaveProperty("status", 404);

    getProject.mockResolvedValue(workflowProject);

    await expect(POST(request({ managerAgentId: "wrong" }), context())).resolves
      .toHaveProperty("status", 403);
    await expect(
      POST(request({ managerAgentId: "manager-1" }, "wrong-token"), context()),
    ).resolves.toHaveProperty("status", 401);
    await expect(
      POST(request({ managerAgentId: "manager-1" }, ""), context()),
    ).resolves.toHaveProperty("status", 401);
    await expect(
      POST(
        new Request("http://localhost/api/projects/project-1/manager/next", {
          headers: { authorization: "Bearer bfm_test-token" },
          body: "{",
          method: "POST",
        }),
        context(),
      ),
    ).resolves.toHaveProperty("status", 400);
  });

  it("requires bearer auth before parsing the request body", async () => {
    mockProjectStore();

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/manager/next", {
        body: "{",
        method: "POST",
      }),
      context(),
    );

    expect(response.status).toBe(401);
  });

  it("fails clearly when a legacy project has no durable manager token", async () => {
    mockProjectStore(
      vi.fn().mockResolvedValue({
        ...workflowProject,
        managerAgent: {
          ...workflowProject.managerAgent,
          accessToken: "",
        },
      }),
    );

    const response = await POST(request({ managerAgentId: "manager-1" }), context());

    expect(response.status).toBe(409);
  });

  it("waits instead of dispatching when a manager cycle is already active", async () => {
    const activeProject = {
      ...workflowProject,
      managerCycles: [
        {
          id: "cycle-active",
          managerAgentId: "manager-1",
          stageId: "architecture",
          stageName: "Architecture",
          taskKey: "github_issue:1",
          taskTitle: "Architecture ready",
          taskUrl: "https://github.com/jonhickman5/GameGlass/issues/1",
          status: "running" as const,
          prompt: "Do architecture.",
          createdAt: "2026-06-21T00:00:00.000Z",
          updatedAt: "2026-06-21T00:00:00.000Z",
          completedAt: null,
          lastHeartbeatAt: "2026-06-21T00:00:00.000Z",
          maxSteps: 20,
          stepCount: 0,
          agents: [],
          failureReason: null,
          terminalSummary: null,
        },
      ],
    };
    const store = mockProjectStore(vi.fn().mockResolvedValue(activeProject));

    vi.mocked(store.markStaleManagerCyclesForProject).mockResolvedValue(activeProject);

    const response = await POST(request({ managerAgentId: "manager-1" }), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("wait");
    expect(body.reason).toBe("active_cycle_exists");
    expect(store.startManagerCycle).not.toHaveBeenCalled();
  });

  it("returns wait when a concurrent request starts a cycle first", async () => {
    const activeProject = {
      ...workflowProject,
      managerCycles: [
        {
          id: "cycle-race",
          managerAgentId: "manager-1",
          stageId: "architecture",
          stageName: "Architecture",
          taskKey: "github_issue:1",
          taskTitle: "Architecture ready",
          taskUrl: "https://github.com/jonhickman5/GameGlass/issues/1",
          status: "running" as const,
          prompt: "Do architecture.",
          createdAt: "2026-06-21T00:00:00.000Z",
          updatedAt: "2026-06-21T00:00:00.000Z",
          completedAt: null,
          lastHeartbeatAt: "2026-06-21T00:00:00.000Z",
          maxSteps: 20,
          stepCount: 0,
          agents: [],
          failureReason: null,
          terminalSummary: null,
        },
      ],
    };
    const store = mockProjectStore(vi.fn().mockResolvedValueOnce(workflowProject).mockResolvedValue(activeProject));

    vi.mocked(store.startManagerCycle).mockRejectedValue(
      new Error("Project already has an active manager cycle."),
    );

    const response = await POST(request({ managerAgentId: "manager-1" }), context());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.decision).toBe("wait");
    expect(body.reason).toBe("active_cycle_exists");
    expect(body.cycleId).toBe("cycle-race");
  });
});
