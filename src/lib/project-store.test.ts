import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getProjectStore, JsonFileProjectStore, type WorkflowStageInput } from "./project-store";

const temporaryDirectories: string[] = [];

function stageInput(name = "Planning"): WorkflowStageInput {
  return {
    name,
    priority: 1,
    instructionsMarkdown: `# ${name}\n\nDo the work.`,
    input: null,
    output: {
      kind: "github_issue",
      status: "Open",
      label: "Pending Architecture",
      refillWhenAtOrBelow: 0,
      holdWhenAtOrAbove: 3,
    },
  };
}

async function createStore() {
  const directory = await mkdtemp(path.join(tmpdir(), "batonflow-project-store-"));

  temporaryDirectories.push(directory);

  return {
    storePath: path.join(directory, "projects.json"),
    store: new JsonFileProjectStore(path.join(directory, "projects.json")),
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("JsonFileProjectStore", () => {
  it("starts empty when no local project file exists yet", async () => {
    const { store } = await createStore();

    await expect(store.listProjects("user-1")).resolves.toEqual([]);
    await expect(store.getProject("missing")).resolves.toBeNull();
  });

  it("creates a local project file and lists projects for the owner only", async () => {
    const { store, storePath } = await createStore();

    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global\n\nVerify changes.",
      stages: [stageInput()],
    });

    await store.createProject({
      ownerUserId: "user-2",
      title: "Other",
      objective: "Stay separate.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput("Implementation")],
    });

    await expect(readFile(storePath, "utf8")).resolves.toContain(project.id);
    await expect(stat(storePath).then((fileStat) => fileStat.mode & 0o777)).resolves.toBe(0o600);
    await expect(store.listProjects("user-1")).resolves.toHaveLength(1);
    await expect(store.listProjects("user-2")).resolves.toHaveLength(1);
  });

  it("updates only a project owned by the requesting user", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput()],
    });

    await expect(
      store.updateProject({
        ownerUserId: "user-2",
        projectId: project.id,
        globalInstructionsMarkdown: "# Wrong owner",
        stages: [stageInput()],
      }),
    ).rejects.toThrow("Project not found.");

    const updatedProject = await store.updateProject({
      ownerUserId: "user-1",
      projectId: project.id,
      objective: "Keep the workflow moving.",
      globalInstructionsMarkdown: "# Updated",
      stages: [stageInput("Architecture")],
    });

    expect(updatedProject.objective).toBe("Keep the workflow moving.");
    expect(updatedProject.globalInstructionsMarkdown).toBe("# Updated");
    expect(updatedProject.stages[0].name).toBe("Architecture");
  });

  it("creates and rotates per-manager access tokens", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput()],
    });

    expect(project.managerAgent.accessToken).toMatch(/^bfm_/);

    await expect(store.rotateManagerAccessToken("user-2", project.id)).rejects.toThrow(
      "Project not found.",
    );

    const updatedProject = await store.rotateManagerAccessToken("user-1", project.id);

    expect(updatedProject.managerAgent.accessToken).toMatch(/^bfm_/);
    expect(updatedProject.managerAgent.accessToken).not.toBe(project.managerAgent.accessToken);
    expect(updatedProject.managerAgent.accessTokenUpdatedAt).toEqual(expect.any(String));
  });

  it("rejects blank update titles and objectives", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput()],
    });

    await expect(
      store.updateProject({
        ownerUserId: "user-1",
        projectId: project.id,
        title: " ",
        objective: project.objective,
        globalInstructionsMarkdown: "# Global",
        stages: [stageInput()],
      }),
    ).rejects.toThrow("Project title is required.");

    await expect(
      store.updateProject({
        ownerUserId: "user-1",
        projectId: project.id,
        title: project.title,
        objective: " ",
        globalInstructionsMarkdown: "# Global",
        stages: [stageInput()],
      }),
    ).rejects.toThrow("Project objective is required.");
  });

  it("serializes concurrent project creates for the same local file", async () => {
    const { store } = await createStore();
    const createdProjects = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        store.createProject({
          ownerUserId: "user-1",
          title: `Project ${index + 1}`,
          objective: "Coordinate autonomous project work.",
          globalInstructionsMarkdown: "# Global",
          stages: [stageInput()],
        }),
      ),
    );

    await expect(store.listProjects("user-1")).resolves.toHaveLength(createdProjects.length);
  });

  it("normalizes stage output caps into a usable range", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [
        {
          ...stageInput(),
          output: {
            ...stageInput().output,
            refillWhenAtOrBelow: 3,
            holdWhenAtOrAbove: 1,
          },
        },
      ],
    });

    expect(project.stages[0].output.refillWhenAtOrBelow).toBe(3);
    expect(project.stages[0].output.holdWhenAtOrAbove).toBe(4);
  });

  it("fills safe defaults for partial stage and global instruction values", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "",
      stages: [
        {
          id: "",
          name: "",
          priority: 0,
          instructionsMarkdown: "",
          input: {
            kind: "unknown" as "github_issue",
            status: "",
            label: " Pending Architecture ",
            minimumReady: Number.NaN,
          },
          output: {
            kind: "unknown" as "github_issue",
            status: "",
            label: " Pending Implementation ",
            refillWhenAtOrBelow: Number.NaN,
            holdWhenAtOrAbove: Number.NaN,
          },
        },
      ],
    });

    expect(project.globalInstructionsMarkdown).toContain("# Global Instructions");
    expect(project.stages[0].id).not.toBe("");
    expect(project.stages[0].name).toBe("Stage 1");
    expect(project.stages[0].priority).toBe(1);
    expect(project.stages[0].input?.kind).toBe("github_issue");
    expect(project.stages[0].input?.status).toBe("Open");
    expect(project.stages[0].input?.label).toBe("Pending Architecture");
    expect(project.stages[0].input?.minimumReady).toBe(1);
    expect(project.stages[0].output.status).toBe("Open");
    expect(project.stages[0].output.label).toBe("Pending Implementation");
    expect(project.settings.maxTaskSteps).toBe(20);
    expect(project.settings.staleAgentMinutes).toBe(90);
  });

  it("associates exactly one GitHub repository and preserves legacy tokens on update", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      repository: {
        owner: "jonhickman5",
        name: "BatonFlow",
        defaultBranch: "main",
        accessToken: "github-token-1",
      },
      settings: {
        maxTaskSteps: 12,
        staleAgentMinutes: 45,
      },
      stages: [stageInput()],
    });

    expect(project.repository).toMatchObject({
      owner: "jonhickman5",
      name: "BatonFlow",
      accessToken: "github-token-1",
    });
    expect(project.settings.maxTaskSteps).toBe(12);

    const updatedProject = await store.updateProject({
      ownerUserId: "user-1",
      projectId: project.id,
      title: project.title,
      objective: project.objective,
      globalInstructionsMarkdown: "# Global",
      repository: {
        owner: "jonhickman5",
        name: "Renamed",
        defaultBranch: "trunk",
        accessToken: "",
      },
      settings: {
        maxTaskSteps: 8,
        staleAgentMinutes: 60,
      },
      stages: [stageInput()],
    });

    expect(updatedProject.repository).toMatchObject({
      owner: "jonhickman5",
      name: "Renamed",
      defaultBranch: "trunk",
      accessToken: "github-token-1",
    });
    expect(updatedProject.settings.maxTaskSteps).toBe(8);
  });

  it("rejects partial GitHub repository configuration", async () => {
    const { store } = await createStore();

    await expect(
      store.createProject({
        ownerUserId: "user-1",
        title: "BatonFlow",
        objective: "Coordinate autonomous project work.",
        globalInstructionsMarkdown: "# Global",
        repository: {
          owner: "jonhickman5",
          name: "",
          defaultBranch: "main",
          accessToken: "github-token",
        },
        stages: [stageInput()],
      }),
    ).rejects.toThrow("GitHub repository owner and name are required together.");

    const tokenlessProject = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      repository: {
        githubRepositoryId: 123,
        owner: "jonhickman5",
        name: "BatonFlow",
        fullName: "jonhickman5/BatonFlow",
        url: "https://github.com/jonhickman5/BatonFlow",
        defaultBranch: "main",
      },
      stages: [stageInput()],
    });

    expect(tokenlessProject.repository).toMatchObject({
      githubRepositoryId: 123,
      fullName: "jonhickman5/BatonFlow",
      accessToken: undefined,
    });
  });

  it("records GitHub issue syncs and recomputes stage eligibility", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [
        {
          ...stageInput("Architecture"),
          input: {
            kind: "github_issue",
            status: "Open",
            label: "Pending Architecture",
            minimumReady: 1,
          },
        },
      ],
    });

    const updatedProject = await store.recordGitHubIssueSync(project.id, [
      {
        id: "issue-1",
        number: 7,
        title: "Plan workflow",
        url: "https://github.com/jonhickman5/BatonFlow/issues/7",
        state: "open",
        labels: ["Pending Architecture"],
        assignees: [],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
        eligibleStageIds: [],
      },
    ]);

    expect(updatedProject.githubIssueCache.issues[0].eligibleStageIds).toEqual([
      updatedProject.stages[0].id,
    ]);
    expect(updatedProject.taskAudit[0].type).toBe("github_sync");

    const failedSyncProject = await store.recordGitHubIssueSync(project.id, [], "bad credentials");

    expect(failedSyncProject.githubIssueCache.error).toBe("bad credentials");
    expect(failedSyncProject.taskAudit.at(-1)?.summary).toContain("GitHub issue sync failed");
  });

  it("normalizes unusual issue snapshots while syncing", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput()],
    });

    const updatedProject = await store.recordGitHubIssueSync(project.id, [
      {
        id: "issue-closed",
        number: 8,
        title: "Closed issue",
        url: "https://github.com/jonhickman5/BatonFlow/issues/8",
        state: "closed",
        labels: "not-array" as unknown as string[],
        assignees: "not-array" as unknown as string[],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
        eligibleStageIds: "bad" as unknown as string[],
      },
    ]);

    expect(updatedProject.githubIssueCache.issues[0]).toMatchObject({
      state: "closed",
      labels: [],
      assignees: [],
      eligibleStageIds: [],
    });
  });

  it("starts manager cycles and records failed agent reports", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      settings: {
        maxTaskSteps: 10,
        staleAgentMinutes: 90,
      },
      stages: [stageInput("Implementation")],
    });

    await store.startManagerCycle({
      cycleId: "cycle-1",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: "Implementation",
      taskKey: "github_issue:42",
      taskTitle: "Implement dashboard",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/42",
      prompt: "Do implementation.",
    });

    const reportedProject = await store.recordManagerReport({
      cycleId: "cycle-1",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      status: "running",
      terminalSummary: "Worker crashed.",
      stepCount: 2,
      agents: [
        {
          name: "Implementation subagent",
          status: "crashed",
          stepCount: 4,
          terminalState: "Process exited unexpectedly.",
          failureReason: "Agent crashed.",
        },
      ],
    });

    expect(reportedProject.managerCycles[0].status).toBe("failed");
    expect(reportedProject.managerCycles[0].agents[0].status).toBe("crashed");
    expect(reportedProject.taskAudit[0].summary).toContain("Agent crashed");
  });

  it("records successful and running manager reports without forcing failure", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput("Implementation")],
    });

    await store.startManagerCycle({
      cycleId: "cycle-running-report",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: "Implementation",
      taskKey: null,
      taskTitle: null,
      taskUrl: null,
      prompt: "Do refill.",
    });

    const runningProject = await store.recordManagerReport({
      cycleId: "cycle-running-report",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      status: "not-real" as "running",
      terminalSummary: null,
      stepCount: Number.NaN,
      agents: [
        {
          name: "Planning observer",
          status: "unknown" as "running",
          durationMs: 1234,
          stepCount: Number.NaN,
        },
      ],
    });

    expect(runningProject.managerCycles[0].status).toBe("running");
    expect(runningProject.managerCycles[0].completedAt).toBeNull();
    expect(runningProject.managerCycles[0].agents[0].durationMs).toBe(1234);

    const completedProject = await store.recordManagerReport({
      cycleId: "cycle-running-report",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      status: "completed",
      terminalSummary: "Refill complete.",
      stepCount: 1,
      agents: [],
    });

    expect(completedProject.managerCycles[0].status).toBe("completed");
    expect(completedProject.managerCycles[0].failureReason).toBeNull();
  });

  it("rejects manager cycle mutations for missing projects or wrong managers", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      stages: [stageInput("Implementation")],
    });

    await expect(
      store.startManagerCycle({
        cycleId: "missing-project",
        managerAgentId: project.managerAgent.id,
        projectId: "missing",
        stageId: null,
        stageName: null,
        taskKey: null,
        taskTitle: null,
        taskUrl: null,
        prompt: "No work.",
      }),
    ).rejects.toThrow("Project not found.");

    await expect(
      store.startManagerCycle({
        cycleId: "wrong-manager",
        managerAgentId: "wrong",
        projectId: project.id,
        stageId: null,
        stageName: null,
        taskKey: null,
        taskTitle: null,
        taskUrl: null,
        prompt: "No work.",
      }),
    ).rejects.toThrow("Manager agent id does not match this project.");

    await expect(
      store.recordManagerReport({
        cycleId: "missing-cycle",
        managerAgentId: project.managerAgent.id,
        projectId: project.id,
        status: "completed",
        terminalSummary: null,
        stepCount: 0,
        agents: [],
      }),
    ).rejects.toThrow("Manager cycle not found.");

    await expect(
      store.recordManagerReport({
        cycleId: "missing-project",
        managerAgentId: project.managerAgent.id,
        projectId: "missing",
        status: "completed",
        terminalSummary: null,
        stepCount: 0,
        agents: [],
      }),
    ).rejects.toThrow("Project not found.");

    await store.startManagerCycle({
      cycleId: "cycle-wrong-manager",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: project.stages[0].name,
      taskKey: null,
      taskTitle: null,
      taskUrl: null,
      prompt: "Do implementation.",
    });

    await expect(
      store.recordManagerReport({
        cycleId: "cycle-wrong-manager",
        managerAgentId: "wrong",
        projectId: project.id,
        status: "completed",
        terminalSummary: null,
        stepCount: 0,
        agents: [],
      }),
    ).rejects.toThrow("Manager agent id does not match this project.");

    await expect(
      store.startManagerCycle({
        cycleId: "cycle-active-duplicate",
        managerAgentId: project.managerAgent.id,
        projectId: project.id,
        stageId: project.stages[0].id,
        stageName: project.stages[0].name,
        taskKey: null,
        taskTitle: null,
        taskUrl: null,
        prompt: "Duplicate work.",
      }),
    ).rejects.toThrow("Project already has an active manager cycle.");

    await expect(store.markStaleManagerCyclesForProject("missing")).rejects.toThrow("Project not found.");
  });

  it("fails tasks that exceed the configured step limit", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      settings: {
        maxTaskSteps: 3,
        staleAgentMinutes: 90,
      },
      stages: [stageInput("Implementation")],
    });

    await store.startManagerCycle({
      cycleId: "cycle-steps",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: "Implementation",
      taskKey: "github_issue:42",
      taskTitle: "Implement dashboard",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/42",
      prompt: "Do implementation.",
    });

    const firstReportedProject = await store.recordManagerReport({
      cycleId: "cycle-steps",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      status: "completed",
      terminalSummary: "Some progress.",
      stepCount: 2,
      agents: [],
    });

    expect(firstReportedProject.managerCycles[0].status).toBe("completed");

    await store.startManagerCycle({
      cycleId: "cycle-steps-2",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: "Implementation",
      taskKey: "github_issue:42",
      taskTitle: "Implement dashboard",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/42",
      prompt: "Continue implementation.",
    });

    const reportedProject = await store.recordManagerReport({
      cycleId: "cycle-steps-2",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      status: "completed",
      terminalSummary: "One more step.",
      stepCount: 1,
      agents: [],
    });

    expect(reportedProject.managerCycles[0].status).toBe("failed");
    expect(reportedProject.taskAudit[0].type).toBe("step_limit_exceeded");
    expect(reportedProject.taskAudit[0].stepCount).toBe(0);
  });

  it("marks stale manager cycles and rejects late reports", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      settings: {
        maxTaskSteps: 10,
        staleAgentMinutes: 1,
      },
      stages: [stageInput("Implementation")],
    });

    await store.startManagerCycle({
      cycleId: "cycle-stale",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: "Implementation",
      taskKey: "github_issue:42",
      taskTitle: "Implement dashboard",
      taskUrl: "https://github.com/jonhickman5/BatonFlow/issues/42",
      prompt: "Do implementation.",
    });

    const staleProject = await store.markStaleManagerCyclesForProject(
      project.id,
      new Date(Date.now() + 120_000),
    );

    expect(staleProject.managerCycles[0].status).toBe("stale");
    await expect(
      store.recordManagerReport({
        cycleId: "cycle-stale",
        managerAgentId: project.managerAgent.id,
        projectId: project.id,
        status: "completed",
        terminalSummary: "Late success.",
        stepCount: 1,
        agents: [],
      }),
    ).rejects.toThrow("Manager cycle is already terminal.");
  });

  it("marks stale cycles for one owner without touching other owners", async () => {
    const { store } = await createStore();
    const project = await store.createProject({
      ownerUserId: "user-1",
      title: "BatonFlow",
      objective: "Coordinate autonomous project work.",
      globalInstructionsMarkdown: "# Global",
      settings: {
        maxTaskSteps: 10,
        staleAgentMinutes: 1,
      },
      stages: [stageInput("Implementation")],
    });
    const otherProject = await store.createProject({
      ownerUserId: "user-2",
      title: "Other",
      objective: "Stay separate.",
      globalInstructionsMarkdown: "# Global",
      settings: {
        maxTaskSteps: 10,
        staleAgentMinutes: 1,
      },
      stages: [stageInput("Implementation")],
    });

    await store.startManagerCycle({
      cycleId: "cycle-owner",
      managerAgentId: project.managerAgent.id,
      projectId: project.id,
      stageId: project.stages[0].id,
      stageName: "Implementation",
      taskKey: "github_issue:1",
      taskTitle: "Task",
      taskUrl: null,
      prompt: "Do work.",
    });
    await store.startManagerCycle({
      cycleId: "cycle-other",
      managerAgentId: otherProject.managerAgent.id,
      projectId: otherProject.id,
      stageId: otherProject.stages[0].id,
      stageName: "Implementation",
      taskKey: "github_issue:2",
      taskTitle: "Task",
      taskUrl: null,
      prompt: "Do work.",
    });

    await store.markStaleManagerCyclesForOwner("user-1", new Date(Date.now() + 120_000));

    expect((await store.getProject(project.id))?.managerCycles[0].status).toBe("stale");
    expect((await store.getProject(otherProject.id))?.managerCycles[0].status).toBe("running");

    await expect(store.markStaleManagerCyclesForOwner("missing")).resolves.toBeUndefined();
  });

  it("rejects missing required project fields and empty stage lists", async () => {
    const { store } = await createStore();

    await expect(
      store.createProject({
        ownerUserId: "user-1",
        title: "",
        objective: "Coordinate autonomous project work.",
        globalInstructionsMarkdown: "# Global",
        stages: [stageInput()],
      }),
    ).rejects.toThrow("Project title and objective are required.");

    await expect(
      store.createProject({
        ownerUserId: "user-1",
        title: "BatonFlow",
        objective: "Coordinate autonomous project work.",
        globalInstructionsMarkdown: "# Global",
        stages: [],
      }),
    ).rejects.toThrow("At least one workflow stage is required.");
  });

  it("throws when the local project file has an unsupported shape", async () => {
    const { store, storePath } = await createStore();

    await writeFile(storePath, JSON.stringify({ version: 999, projects: [] }), "utf8");

    await expect(store.listProjects("user-1")).rejects.toThrow(
      "Unsupported BatonFlow project store version",
    );
  });

  it("does not silently backfill missing manager tokens on read", async () => {
    const { store, storePath } = await createStore();

    await writeFile(
      storePath,
      JSON.stringify({
        version: 1,
        projects: [
          {
            id: "project-1",
            ownerUserId: "user-1",
            title: "Legacy project",
            objective: "Needs rotation.",
            globalInstructionsMarkdown: "# Global",
            managerAgent: {
              id: "manager-1",
              name: "Manager",
              projectId: "project-1",
              createdAt: "2026-06-21T00:00:00.000Z",
            },
            stages: [stageInput()],
            createdAt: "2026-06-21T00:00:00.000Z",
            lastUpdated: "2026-06-21T00:00:00.000Z",
          },
        ],
        lastUpdated: "2026-06-21T00:00:00.000Z",
      }),
      "utf8",
    );

    const project = await store.getProject("project-1");

    expect(project?.managerAgent.accessToken).toBeUndefined();
  });

  it("returns a singleton project store for app code", () => {
    expect(getProjectStore()).toBe(getProjectStore());
  });
});
