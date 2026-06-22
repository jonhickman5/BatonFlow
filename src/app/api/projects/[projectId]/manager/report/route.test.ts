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
  globalInstructionsMarkdown: "# Global",
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
};

function context(projectId = "project-1") {
  return {
    params: Promise.resolve({ projectId }),
  };
}

function request(body: unknown, token = "bfm_test-token") {
  return new Request("http://localhost/api/projects/project-1/manager/report", {
    body: JSON.stringify(body),
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    method: "POST",
  });
}

function mockProjectStore(getProject = vi.fn().mockResolvedValue(workflowProject)) {
  const store: ProjectStore = {
    listProjects: vi.fn(),
    getProject,
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    deleteProjectsForOwner: vi.fn(),
    rotateManagerAccessToken: vi.fn(),
    recordGitHubIssueSync: vi.fn(),
    startManagerCycle: vi.fn(),
    recordManagerReport: vi.fn().mockResolvedValue(workflowProject),
    markStaleManagerCyclesForProject: vi.fn().mockResolvedValue(workflowProject),
    markStaleManagerCyclesForOwner: vi.fn(),
  };

  vi.mocked(getProjectStore).mockReturnValue(store);
  return store;
}

describe("POST /api/projects/[projectId]/manager/report", () => {
  it("records terminal subagent reports", async () => {
    const store = mockProjectStore();

    const response = await POST(
      request({
        managerAgentId: "manager-1",
        cycleId: "cycle-1",
        status: "completed",
        terminalSummary: "Opened PR.",
        stepCount: 2,
        agents: [
          {
            name: "Implementation subagent",
            status: "completed",
            stepCount: 7,
            terminalState: "Tests passed.",
          },
        ],
      }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(store.markStaleManagerCyclesForProject).toHaveBeenCalledWith("project-1");
    expect(store.recordManagerReport).toHaveBeenCalledWith(
      expect.objectContaining({
        cycleId: "cycle-1",
        status: "completed",
        agents: [expect.objectContaining({ name: "Implementation subagent" })],
      }),
    );
  });

  it("rejects reports after stale marking makes the cycle terminal", async () => {
    const store = mockProjectStore();

    vi.mocked(store.recordManagerReport).mockRejectedValue(
      new Error("Manager cycle is already terminal."),
    );

    const response = await POST(
      request({
        managerAgentId: "manager-1",
        cycleId: "cycle-late",
        status: "completed",
        terminalSummary: "Late success.",
        stepCount: 1,
        agents: [],
      }),
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(store.markStaleManagerCyclesForProject).toHaveBeenCalledWith("project-1");
    expect(body.error).toBe("Manager cycle is already terminal.");
  });

  it("requires bearer auth before parsing the request body", async () => {
    mockProjectStore();

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/manager/report", {
        body: "{",
        method: "POST",
      }),
      context(),
    );

    expect(response.status).toBe(401);
  });

  it("rejects wrong manager ids, missing cycles, and unknown projects", async () => {
    const getProject = vi.fn().mockResolvedValue(null);

    mockProjectStore(getProject);

    await expect(
      POST(request({ managerAgentId: "manager-1", cycleId: "cycle-1" }), context()),
    ).resolves.toHaveProperty("status", 404);

    getProject.mockResolvedValue(workflowProject);

    await expect(
      POST(request({ managerAgentId: "wrong", cycleId: "cycle-1" }), context()),
    ).resolves.toHaveProperty("status", 403);
    await expect(POST(request({ managerAgentId: "manager-1" }), context())).resolves.toHaveProperty(
      "status",
      400,
    );
  });
});
