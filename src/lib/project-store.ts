import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_MAX_TASK_STEPS,
  DEFAULT_STALE_AGENT_MINUTES,
  applyIssueEligibilityToProject,
  getActiveManagerCycles,
  getTaskStepCount,
  markStaleManagerCycles,
  workflowResourceKinds,
} from "@/lib/data-structures";
import type {
  GitHubIssueSnapshot,
  GitHubRepositoryConfig,
  WorkflowAgentRun,
  WorkflowAgentStatus,
  WorkflowInputRule,
  WorkflowManagerCycle,
  WorkflowManagerCycleStatus,
  WorkflowOutputRule,
  WorkflowProject,
  WorkflowResourceKind,
  WorkflowStageDefinition,
  WorkflowTaskAuditEvent,
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
  repository?: GitHubRepositoryInput | null;
  settings?: Partial<WorkflowProjectSettingsInput>;
  stages: WorkflowStageInput[];
};

export type UpdateWorkflowProjectInput = {
  projectId: string;
  ownerUserId: string;
  title?: string;
  objective?: string;
  globalInstructionsMarkdown: string;
  repository?: GitHubRepositoryInput | null;
  settings?: Partial<WorkflowProjectSettingsInput>;
  stages: WorkflowStageInput[];
};

export type GitHubRepositoryInput = {
  owner: string;
  name: string;
  accessToken: string;
  defaultBranch: string;
};

export type WorkflowProjectSettingsInput = {
  maxTaskSteps: number;
  staleAgentMinutes: number;
};

export type StartManagerCycleInput = {
  cycleId: string;
  managerAgentId: string;
  projectId: string;
  stageId: string | null;
  stageName: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  prompt: string;
};

export type ManagerAgentReportInput = {
  cycleId: string;
  managerAgentId: string;
  projectId: string;
  status: WorkflowManagerCycleStatus;
  terminalSummary: string | null;
  stepCount: number;
  agents: Array<Partial<WorkflowAgentRun> & { name: string }>;
};

const workflowAgentStatuses = [
  "running",
  "completed",
  "failed",
  "blocked",
  "crashed",
  "cancelled",
] as const;
const workflowManagerCycleStatuses = [
  "running",
  "completed",
  "failed",
  "blocked",
  "stale",
  "cancelled",
  "skipped",
] as const;

export interface ProjectStore {
  listProjects(ownerUserId: string): Promise<WorkflowProject[]>;
  getProject(projectId: string): Promise<WorkflowProject | null>;
  createProject(input: CreateWorkflowProjectInput): Promise<WorkflowProject>;
  updateProject(input: UpdateWorkflowProjectInput): Promise<WorkflowProject>;
  rotateManagerAccessToken(ownerUserId: string, projectId: string): Promise<WorkflowProject>;
  recordGitHubIssueSync(projectId: string, issues: GitHubIssueSnapshot[], error?: string | null): Promise<WorkflowProject>;
  startManagerCycle(input: StartManagerCycleInput): Promise<WorkflowProject>;
  recordManagerReport(input: ManagerAgentReportInput): Promise<WorkflowProject>;
  markStaleManagerCyclesForProject(projectId: string, now?: Date): Promise<WorkflowProject>;
  markStaleManagerCyclesForOwner(ownerUserId: string, now?: Date): Promise<void>;
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

function normalizeSettings(settings: Partial<WorkflowProjectSettingsInput> | undefined) {
  return {
    maxTaskSteps: Math.max(
      1,
      normalizeInteger(settings?.maxTaskSteps ?? DEFAULT_MAX_TASK_STEPS, DEFAULT_MAX_TASK_STEPS),
    ),
    staleAgentMinutes: Math.max(
      1,
      normalizeInteger(settings?.staleAgentMinutes ?? DEFAULT_STALE_AGENT_MINUTES, DEFAULT_STALE_AGENT_MINUTES),
    ),
  };
}

function normalizeRepositoryInput(
  input: GitHubRepositoryInput | null | undefined,
  currentRepository: GitHubRepositoryConfig | null = null,
): GitHubRepositoryConfig | null {
  if (input === undefined) {
    return currentRepository;
  }

  const owner = input?.owner.trim() ?? "";
  const name = input?.name.trim() ?? "";
  const accessToken = input?.accessToken.trim() ?? "";
  const defaultBranch = input?.defaultBranch.trim() || currentRepository?.defaultBranch || "main";

  if (!owner && !name && !accessToken) {
    return null;
  }

  if (!owner || !name) {
    throw new Error("GitHub repository owner and name are required together.");
  }

  if (!accessToken && !currentRepository?.accessToken) {
    throw new Error("A GitHub access token is required to associate the repository.");
  }

  return {
    provider: "github",
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
    defaultBranch,
    accessToken: accessToken || currentRepository?.accessToken || "",
    connectedAt: currentRepository?.connectedAt ?? new Date().toISOString(),
    lastSyncedAt: currentRepository?.lastSyncedAt ?? null,
    syncError: currentRepository?.syncError ?? null,
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
    settings: normalizeSettings(input.settings),
    stages,
  };
}

function createAccessToken(): string {
  return `bfm_${randomBytes(32).toString("base64url")}`;
}

function isWorkflowAgentStatus(status: unknown): status is WorkflowAgentStatus {
  return workflowAgentStatuses.includes(status as WorkflowAgentStatus);
}

function isWorkflowManagerCycleStatus(status: unknown): status is WorkflowManagerCycleStatus {
  return workflowManagerCycleStatuses.includes(status as WorkflowManagerCycleStatus);
}

function terminalCycleStatus(status: WorkflowManagerCycleStatus) {
  return !["running"].includes(status);
}

function terminalAgentStatus(status: WorkflowAgentStatus) {
  return !["running"].includes(status);
}

function normalizeStoredProject(project: WorkflowProject): WorkflowProject {
  const normalizedProject = applyIssueEligibilityToProject({
    ...project,
    repository: project.repository ?? null,
    settings: normalizeSettings(project.settings),
    githubIssueCache: project.githubIssueCache ?? {
      issues: [],
      syncedAt: null,
      error: null,
    },
    managerCycles: project.managerCycles ?? [],
    taskAudit: project.taskAudit ?? [],
  });

  return normalizedProject;
}

function normalizeIssue(issue: GitHubIssueSnapshot): GitHubIssueSnapshot {
  return {
    ...issue,
    kind: issue.kind === "github_pull_request" ? "github_pull_request" : "github_issue",
    state: issue.state === "closed" ? "closed" : "open",
    labels: Array.isArray(issue.labels) ? issue.labels.map((label) => label.trim()).filter(Boolean) : [],
    assignees: Array.isArray(issue.assignees)
      ? issue.assignees.map((assignee) => assignee.trim()).filter(Boolean)
      : [],
    eligibleStageIds: Array.isArray(issue.eligibleStageIds) ? issue.eligibleStageIds : [],
  };
}

function normalizeAgentReport(
  agent: Partial<WorkflowAgentRun> & { name: string },
  cycle: WorkflowManagerCycle,
  now: string,
): WorkflowAgentRun {
  const status = isWorkflowAgentStatus(agent.status) ? agent.status : "running";
  const startedAt = agent.startedAt ?? cycle.createdAt;
  const completedAt = agent.completedAt ?? (terminalAgentStatus(status) ? now : null);
  const durationMs =
    typeof agent.durationMs === "number" && Number.isFinite(agent.durationMs)
      ? Math.max(0, Math.floor(agent.durationMs))
      : completedAt
        ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
        : null;

  return {
    id: agent.id?.trim() || randomUUID(),
    name: agent.name.trim() || "Subagent",
    stageId: agent.stageId ?? cycle.stageId,
    stageName: agent.stageName ?? cycle.stageName,
    taskKey: agent.taskKey ?? cycle.taskKey,
    taskTitle: agent.taskTitle ?? cycle.taskTitle,
    taskUrl: agent.taskUrl ?? cycle.taskUrl,
    status,
    terminalState: agent.terminalState?.trim() || null,
    startedAt,
    completedAt,
    durationMs,
    stepCount: normalizeInteger(agent.stepCount ?? 0, 0),
    failureReason: agent.failureReason?.trim() || null,
  };
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
    const repository = normalizeRepositoryInput(input.repository);

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
        repository,
        settings: normalized.settings,
        managerAgent: {
          id: randomUUID(),
          name: "Manager",
          projectId,
          accessToken: createAccessToken(),
          createdAt: now,
          accessTokenUpdatedAt: now,
        },
        stages: normalized.stages,
        githubIssueCache: {
          issues: [],
          syncedAt: null,
          error: null,
        },
        managerCycles: [],
        taskAudit: [],
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
      const repository = normalizeRepositoryInput(input.repository, currentProject.repository);
      const updatedProject = applyIssueEligibilityToProject({
        ...currentProject,
        title: normalized.title ?? currentProject.title,
        objective: normalized.objective ?? currentProject.objective,
        globalInstructionsMarkdown: normalized.globalInstructionsMarkdown,
        repository,
        settings: normalized.settings,
        stages: normalized.stages,
        lastUpdated: now,
      });

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

  async recordGitHubIssueSync(
    projectId: string,
    issues: GitHubIssueSnapshot[],
    error: string | null = null,
  ): Promise<WorkflowProject> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const projectIndex = snapshot.projects.findIndex((project) => project.id === projectId);

      if (projectIndex === -1) {
        throw new Error("Project not found.");
      }

      const now = new Date().toISOString();
      const currentProject = snapshot.projects[projectIndex];
      const normalizedIssues = issues.map(normalizeIssue);
      const updatedProject = applyIssueEligibilityToProject({
        ...currentProject,
        githubIssueCache: {
          issues: normalizedIssues,
          syncedAt: error ? currentProject.githubIssueCache.syncedAt : now,
          error,
        },
        repository: currentProject.repository
          ? {
              ...currentProject.repository,
              lastSyncedAt: error ? currentProject.repository.lastSyncedAt : now,
              syncError: error,
            }
          : null,
        taskAudit: [
          ...currentProject.taskAudit,
          {
            id: randomUUID(),
            cycleId: null,
            agentId: null,
            taskKey: null,
            taskTitle: null,
            taskUrl: null,
            stageId: null,
            stageName: null,
            type: "github_sync",
            summary: error
              ? `GitHub issue sync failed: ${error}`
              : `Synced ${normalizedIssues.length} GitHub issue${normalizedIssues.length === 1 ? "" : "s"}.`,
            createdAt: now,
            durationMs: null,
            stepCount: 0,
            status: error ? "failed" : "eligible",
          },
        ],
        lastUpdated: now,
      });

      snapshot.projects[projectIndex] = updatedProject;
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return updatedProject;
    });
  }

  async startManagerCycle(input: StartManagerCycleInput): Promise<WorkflowProject> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const projectIndex = snapshot.projects.findIndex((project) => project.id === input.projectId);

      if (projectIndex === -1) {
        throw new Error("Project not found.");
      }

      const currentProject = snapshot.projects[projectIndex];

      if (currentProject.managerAgent.id !== input.managerAgentId) {
        throw new Error("Manager agent id does not match this project.");
      }

      if (input.stageId && getActiveManagerCycles(currentProject).length > 0) {
        throw new Error("Project already has an active manager cycle.");
      }

      const now = new Date().toISOString();
      const cycle: WorkflowManagerCycle = {
        id: input.cycleId,
        managerAgentId: input.managerAgentId,
        stageId: input.stageId,
        stageName: input.stageName,
        taskKey: input.taskKey,
        taskTitle: input.taskTitle,
        taskUrl: input.taskUrl,
        status: input.stageId ? "running" : "skipped",
        prompt: input.prompt,
        createdAt: now,
        updatedAt: now,
        completedAt: input.stageId ? null : now,
        lastHeartbeatAt: now,
        maxSteps: currentProject.settings.maxTaskSteps,
        stepCount: 0,
        agents: [],
        failureReason: null,
        terminalSummary: null,
      };
      const updatedProject: WorkflowProject = {
        ...currentProject,
        managerCycles: [cycle, ...currentProject.managerCycles].slice(0, 100),
        taskAudit: [
          {
            id: randomUUID(),
            cycleId: cycle.id,
            agentId: null,
            taskKey: input.taskKey,
            taskTitle: input.taskTitle,
            taskUrl: input.taskUrl,
            stageId: input.stageId,
            stageName: input.stageName,
            type: "manager_selected",
            summary: input.stageId
              ? `Manager selected ${input.stageName}${input.taskTitle ? ` for ${input.taskTitle}` : ""}.`
              : "Manager found no eligible stage to dispatch.",
            createdAt: now,
            durationMs: null,
            stepCount: 0,
            status: input.stageId ? "running" : "skipped",
          },
          ...currentProject.taskAudit,
        ].slice(0, 300) as WorkflowTaskAuditEvent[],
        lastUpdated: now,
      };

      snapshot.projects[projectIndex] = updatedProject;
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return updatedProject;
    });
  }

  async recordManagerReport(input: ManagerAgentReportInput): Promise<WorkflowProject> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const projectIndex = snapshot.projects.findIndex((project) => project.id === input.projectId);

      if (projectIndex === -1) {
        throw new Error("Project not found.");
      }

      const currentProject = snapshot.projects[projectIndex];
      const cycleIndex = currentProject.managerCycles.findIndex((cycle) => cycle.id === input.cycleId);

      if (cycleIndex === -1) {
        throw new Error("Manager cycle not found.");
      }

      if (currentProject.managerAgent.id !== input.managerAgentId) {
        throw new Error("Manager agent id does not match this project.");
      }

      const now = new Date().toISOString();
      const currentCycle = currentProject.managerCycles[cycleIndex];

      if (terminalCycleStatus(currentCycle.status)) {
        throw new Error("Manager cycle is already terminal.");
      }

      const agents = input.agents.map((agent) => normalizeAgentReport(agent, currentCycle, now));
      const hasFailedAgent = agents.some((agent) =>
        ["failed", "blocked", "crashed"].includes(agent.status),
      );
      const reportedStatus = isWorkflowManagerCycleStatus(input.status) ? input.status : "running";
      const stepCount =
        normalizeInteger(input.stepCount, 0) + agents.reduce((total, agent) => total + agent.stepCount, 0);
      const cumulativeStepCount = stepCount + getTaskStepCount(currentProject, currentCycle.taskKey);
      const exceededStepLimit = Boolean(currentCycle.taskKey && cumulativeStepCount >= currentCycle.maxSteps);
      const status: WorkflowManagerCycleStatus =
        hasFailedAgent
          ? "failed"
          : exceededStepLimit
            ? "failed"
            : reportedStatus;
      const failureReason =
        exceededStepLimit
          ? `Task exceeded the configured max step limit of ${currentCycle.maxSteps}.`
          : input.terminalSummary?.trim() || (hasFailedAgent ? "One or more subagents failed." : null);
      const updatedCycle: WorkflowManagerCycle = {
        ...currentCycle,
        status,
        updatedAt: now,
        completedAt: terminalCycleStatus(status) ? now : null,
        lastHeartbeatAt: now,
        stepCount,
        agents,
        failureReason: ["failed", "blocked", "stale"].includes(status) ? failureReason : null,
        terminalSummary: input.terminalSummary?.trim() || null,
      };
      const auditEvents: WorkflowTaskAuditEvent[] = [
        ...agents.map((agent) => ({
          id: randomUUID(),
          cycleId: updatedCycle.id,
          agentId: agent.id,
          taskKey: agent.taskKey,
          taskTitle: agent.taskTitle,
          taskUrl: agent.taskUrl,
          stageId: agent.stageId,
          stageName: agent.stageName,
          type: "agent_reported" as const,
          summary: `${agent.name} reported ${agent.status}${agent.failureReason ? `: ${agent.failureReason}` : ""}.`,
          createdAt: now,
          durationMs: agent.durationMs,
          stepCount: agent.stepCount,
          status: agent.status,
        })),
        ...(updatedCycle.taskKey && exceededStepLimit
          ? [
              {
                id: randomUUID(),
                cycleId: updatedCycle.id,
                agentId: null,
                taskKey: updatedCycle.taskKey,
                taskTitle: updatedCycle.taskTitle,
                taskUrl: updatedCycle.taskUrl,
                stageId: updatedCycle.stageId,
                stageName: updatedCycle.stageName,
                type: "step_limit_exceeded" as const,
                summary: `Task exceeded the configured max step limit of ${currentCycle.maxSteps}.`,
                createdAt: now,
                durationMs: null,
                stepCount: 0,
                status: "failed" as const,
              },
            ]
          : []),
      ];
      const managerCycles = [...currentProject.managerCycles];
      managerCycles[cycleIndex] = updatedCycle;
      const updatedProject: WorkflowProject = {
        ...currentProject,
        managerCycles,
        taskAudit: [...auditEvents, ...currentProject.taskAudit].slice(0, 300),
        lastUpdated: now,
      };

      snapshot.projects[projectIndex] = updatedProject;
      snapshot.lastUpdated = now;
      await this.writeSnapshot(snapshot);

      return updatedProject;
    });
  }

  async markStaleManagerCyclesForProject(projectId: string, now = new Date()): Promise<WorkflowProject> {
    return this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      const projectIndex = snapshot.projects.findIndex((project) => project.id === projectId);

      if (projectIndex === -1) {
        throw new Error("Project not found.");
      }

      const updatedProject = markStaleManagerCycles(snapshot.projects[projectIndex], now);

      snapshot.projects[projectIndex] = {
        ...updatedProject,
        lastUpdated: now.toISOString(),
      };
      snapshot.lastUpdated = now.toISOString();
      await this.writeSnapshot(snapshot);

      return snapshot.projects[projectIndex];
    });
  }

  async markStaleManagerCyclesForOwner(ownerUserId: string, now = new Date()): Promise<void> {
    await this.enqueueMutation(async () => {
      const snapshot = await this.readSnapshot();
      let changed = false;

      snapshot.projects = snapshot.projects.map((project) => {
        if (project.ownerUserId !== ownerUserId) {
          return project;
        }

        const updatedProject = markStaleManagerCycles(project, now);
        changed ||= updatedProject !== project;

        return updatedProject;
      });

      if (changed) {
        snapshot.lastUpdated = now.toISOString();
        await this.writeSnapshot(snapshot);
      }
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

      snapshot.projects = snapshot.projects.map(normalizeStoredProject);

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
