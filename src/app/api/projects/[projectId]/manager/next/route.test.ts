import { describe, expect, it, vi } from "vitest";
import type { WorkflowProject } from "@/lib/data-structures";
import { getProjectStore } from "@/lib/project-store";
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

describe("POST /api/projects/[projectId]/manager/next", () => {
  it("returns a next prompt using runtime resource counts", async () => {
    vi.mocked(getProjectStore).mockReturnValue({
      listProjects: vi.fn(),
      getProject: vi.fn().mockResolvedValue(workflowProject),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      rotateManagerAccessToken: vi.fn(),
    });

    const response = await POST(
      request({
        managerAgentId: "manager-1",
        resourceCounts: {
          "github_issue:open:pending architecture": 1,
          "github_issue:open:pending implementation": 0,
        },
      }),
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.selectedStageName).toBe("Architecture");
    expect(body.prompt).toContain("# Architecture");
  });

  it("rejects missing projects, wrong manager ids, missing counts, and invalid JSON", async () => {
    const getProject = vi.fn().mockResolvedValue(null);

    vi.mocked(getProjectStore).mockReturnValue({
      listProjects: vi.fn(),
      getProject,
      createProject: vi.fn(),
      updateProject: vi.fn(),
      rotateManagerAccessToken: vi.fn(),
    });

    await expect(POST(request({ managerAgentId: "manager-1", resourceCounts: {} }), context())).resolves
      .toHaveProperty("status", 404);

    getProject.mockResolvedValue(workflowProject);

    await expect(POST(request({ managerAgentId: "wrong", resourceCounts: {} }), context())).resolves
      .toHaveProperty("status", 403);
    await expect(
      POST(request({ managerAgentId: "manager-1", resourceCounts: {} }, "wrong-token"), context()),
    ).resolves.toHaveProperty("status", 401);
    await expect(
      POST(request({ managerAgentId: "manager-1", resourceCounts: {} }, ""), context()),
    ).resolves.toHaveProperty("status", 401);
    await expect(POST(request({ managerAgentId: "manager-1" }), context())).resolves.toHaveProperty(
      "status",
      400,
    );
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
    vi.mocked(getProjectStore).mockReturnValue({
      listProjects: vi.fn(),
      getProject: vi.fn().mockResolvedValue(workflowProject),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      rotateManagerAccessToken: vi.fn(),
    });

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
    vi.mocked(getProjectStore).mockReturnValue({
      listProjects: vi.fn(),
      getProject: vi.fn().mockResolvedValue({
        ...workflowProject,
        managerAgent: {
          ...workflowProject.managerAgent,
          accessToken: "",
        },
      }),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      rotateManagerAccessToken: vi.fn(),
    });

    const response = await POST(request({ managerAgentId: "manager-1", resourceCounts: {} }), context());

    expect(response.status).toBe(409);
  });
});
