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
