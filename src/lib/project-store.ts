import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { workflowResourceKinds } from "@/lib/data-structures";
import type {
  WorkflowInputRule,
  WorkflowOutputRule,
  WorkflowProject,
  WorkflowResourceKind,
  WorkflowStageDefinition,
} from "@/lib/data-structures";

const STORE_VERSION = 1;
const DEFAULT_STORE_PATH = path.join(process.cwd(), ".data", "batonflow-projects.json");
const writeQueues = new Map<string, Promise<unknown>>();

type ProjectStoreSnapshot = {
  version: typeof STORE_VERSION;
  projects: WorkflowProject[];
  lastUpdated: string;
};

export type WorkflowStageInput = {
  id?: string;
  name: string;
  priority: number;
  instructionsMarkdown: string;
  input: WorkflowInputRule | null;
  output: WorkflowOutputRule;
};

export type CreateWorkflowProjectInput = {
  ownerUserId: string;
  title: string;
  objective: string;
  globalInstructionsMarkdown: string;
  stages: WorkflowStageInput[];
};

export type UpdateWorkflowProjectInput = {
  projectId: string;
  ownerUserId: string;
  title?: string;
  objective?: string;
  globalInstructionsMarkdown: string;
  stages: WorkflowStageInput[];
};

export interface ProjectStore {
  listProjects(ownerUserId: string): Promise<WorkflowProject[]>;
  getProject(projectId: string): Promise<WorkflowProject | null>;
  createProject(input: CreateWorkflowProjectInput): Promise<WorkflowProject>;
  updateProject(input: UpdateWorkflowProjectInput): Promise<WorkflowProject>;
  rotateManagerAccessToken(ownerUserId: string, projectId: string): Promise<WorkflowProject>;
}

function emptySnapshot(): ProjectStoreSnapshot {
  return {
    version: STORE_VERSION,
    projects: [],
    lastUpdated: new Date().toISOString(),
  };
}

function isWorkflowResourceKind(value: string): value is WorkflowResourceKind {
  return workflowResourceKinds.includes(value as WorkflowResourceKind);
}

function normalizeResourceKind(value: string): WorkflowResourceKind {
  return isWorkflowResourceKind(value) ? value : "github_issue";
}

function normalizeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function normalizeInputRule(rule: WorkflowInputRule | null): WorkflowInputRule | null {
  if (!rule) {
    return null;
  }

  return {
    kind: normalizeResourceKind(rule.kind),
    status: rule.status.trim() || "Open",
    label: rule.label.trim(),
    minimumReady: normalizeInteger(rule.minimumReady, 1),
  };
}

function normalizeOutputRule(rule: WorkflowOutputRule): WorkflowOutputRule {
  const refillWhenAtOrBelow = normalizeInteger(rule.refillWhenAtOrBelow, 0);
  const holdWhenAtOrAbove = Math.max(
    refillWhenAtOrBelow + 1,
    normalizeInteger(rule.holdWhenAtOrAbove, refillWhenAtOrBelow + 1),
  );

  return {
    kind: normalizeResourceKind(rule.kind),
    status: rule.status.trim() || "Open",
    label: rule.label.trim(),
    refillWhenAtOrBelow,
    holdWhenAtOrAbove,
  };
}

function normalizeStage(stage: WorkflowStageInput, index: number): WorkflowStageDefinition {
  const stageName = stage.name.trim() || `Stage ${index + 1}`;

  return {
    id: stage.id?.trim() || randomUUID(),
    name: stageName,
    priority: Math.max(1, Math.floor(stage.priority || index + 1)),
    instructionsMarkdown:
      stage.instructionsMarkdown.trim() ||
      `# ${stageName}\n\nDefine how this agent should turn its configured input into its configured output.`,
    input: normalizeInputRule(stage.input),
    output: normalizeOutputRule(stage.output),
  };
}

function normalizeProjectInput(input: CreateWorkflowProjectInput | UpdateWorkflowProjectInput) {
  const stages = input.stages.map((stage, index) => normalizeStage(stage, index));
  const title = "title" in input ? input.title?.trim() : undefined;
  const objective = "objective" in input ? input.objective?.trim() : undefined;

  if (stages.length === 0) {
    throw new Error("At least one workflow stage is required.");
  }

  return {
    title: title || undefined,
    objective: objective || undefined,
    globalInstructionsMarkdown:
      input.globalInstructionsMarkdown.trim() ||
      "# Global Instructions\n\nKeep work scoped, verify before handoff, and preserve the configured workflow state.",
    stages,
  };
}

function createAccessToken(): string {
  return `bfm_${randomBytes(32).toString("base64url")}`;
}

export class JsonFileProjectStore implements ProjectStore {
  constructor(private readonly storePath = process.env.BATONFLOW_PROJECT_STORE_PATH ?? DEFAULT_STORE_PATH) {}

  async listProjects(ownerUserId: string): Promise<WorkflowProject[]> {
    const snapshot = await this.readSnapshot();

    return snapshot.projects
      .filter((project) => project.ownerUserId === ownerUserId)
      .sort((left, right) => right.lastUpdated.localeCompare(left.lastUpdated));
  }

  async getProject(projectId: string): Promise<WorkflowProject | null> {
    const snapshot = await this.readSnapshot();

    return snapshot.projects.find((project) => project.id === projectId) ?? null;
  }

  async createProject(input: CreateWorkflowProjectInput): Promise<WorkflowProject> {
    const normalized = normalizeProjectInput(input);

    if (!normalized.title || !normalized.objective) {
      throw new Error("Project title and objective are required.");
    }

    const title = normalized.title;
    const objective = normalized.objective;

    return this.enqueueMutation(async () => {
      const now = new Date().toISOString();
      const projectId = randomUUID();
      const project: WorkflowProject = {
        id: projectId,
        ownerUserId: input.ownerUserId,
        title,
        objective,
        globalInstructionsMarkdown: normalized.globalInstructionsMarkdown,
        managerAgent: {
          id: randomUUID(),
          name: "Manager",
          projectId,
          accessToken: createAccessToken(),
          createdAt: now,
          accessTokenUpdatedAt: now,
        },
        stages: normalized.stages,
        createdAt: now,
        lastUpdated: now,
      };
      const snapshot = await this.readSnapshot();

      snapshot.projects.push(project);
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return project;
    });
  }

  async updateProject(input: UpdateWorkflowProjectInput): Promise<WorkflowProject> {
    const normalized = normalizeProjectInput(input);

    if ("title" in input && !normalized.title) {
      throw new Error("Project title is required.");
    }

    if ("objective" in input && !normalized.objective) {
      throw new Error("Project objective is required.");
    }

    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const projectIndex = snapshot.projects.findIndex(
        (project) => project.id === input.projectId && project.ownerUserId === input.ownerUserId,
      );

      if (projectIndex === -1) {
        throw new Error("Project not found.");
      }

      const now = new Date().toISOString();
      const currentProject = snapshot.projects[projectIndex];
      const updatedProject: WorkflowProject = {
        ...currentProject,
        title: normalized.title ?? currentProject.title,
        objective: normalized.objective ?? currentProject.objective,
        globalInstructionsMarkdown: normalized.globalInstructionsMarkdown,
        stages: normalized.stages,
        lastUpdated: now,
      };

      snapshot.projects[projectIndex] = updatedProject;
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return updatedProject;
    });
  }

  async rotateManagerAccessToken(ownerUserId: string, projectId: string): Promise<WorkflowProject> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const projectIndex = snapshot.projects.findIndex(
        (project) => project.id === projectId && project.ownerUserId === ownerUserId,
      );

      if (projectIndex === -1) {
        throw new Error("Project not found.");
      }

      const now = new Date().toISOString();
      const currentProject = snapshot.projects[projectIndex];
      const updatedProject: WorkflowProject = {
        ...currentProject,
        managerAgent: {
          ...currentProject.managerAgent,
          accessToken: createAccessToken(),
          accessTokenUpdatedAt: now,
        },
        lastUpdated: now,
      };

      snapshot.projects[projectIndex] = updatedProject;
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return updatedProject;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previousWrite = writeQueues.get(this.storePath) ?? Promise.resolve();
    const nextWrite = previousWrite.catch(() => undefined).then(operation);

    writeQueues.set(this.storePath, nextWrite.catch(() => undefined));

    return nextWrite;
  }

  private async readSnapshot(): Promise<ProjectStoreSnapshot> {
    try {
      const rawSnapshot = await readFile(this.storePath, "utf8");
      const snapshot = JSON.parse(rawSnapshot) as ProjectStoreSnapshot;

      if (snapshot.version !== STORE_VERSION || !Array.isArray(snapshot.projects)) {
        throw new Error(`Unsupported BatonFlow project store version in ${this.storePath}.`);
      }

      return snapshot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptySnapshot();
      }

      throw error;
    }
  }

  private async writeSnapshot(snapshot: ProjectStoreSnapshot): Promise<void> {
    const directory = path.dirname(this.storePath);
    const temporaryPath = path.join(directory, `${path.basename(this.storePath)}.${randomUUID()}.tmp`);

    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.storePath);
  }
}

let projectStore: ProjectStore | null = null;

export function getProjectStore(): ProjectStore {
  projectStore ??= new JsonFileProjectStore();

  return projectStore;
}
