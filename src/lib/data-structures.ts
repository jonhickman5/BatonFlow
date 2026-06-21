export type ProjectStatus = "active" | "paused" | "archived";

export type PlanType = "free" | "pro" | "team";

export type EmailVerificationStatus = "unverified" | "pending" | "verified";

export type WorkflowResourceKind = "github_issue" | "github_pull_request" | "manual_task";

export type UserAccount = {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string | null;
  emailVerificationStatus: EmailVerificationStatus;
  phoneNumber: string | null;
  displayName: string | null;
  planType: PlanType;
  createdAt: string;
  lastUpdated: string;
};

export type ValidNextStage = {
  stageId: string;
  description?: string;
};

export type Stage = {
  id: string;
  name: string;
  validNextStages: ValidNextStage[];
  promptId: string;
  additionalContextPromptIds: string[];
};

export type Project = {
  id: string;
  title: string;
  description: string | null;
  stages: Stage[];
  startStageId: string;
  status: ProjectStatus;
  createdAt: string;
  lastUpdated: string;
};

export type PromptType =
  | "manager"
  | "stage"
  | "north_star"
  | "operations"
  | "role_specifics"
  | "planning_research"
  | "user_defined";

export type Prompt = {
  id: string;
  projectId: string;
  type: PromptType;
  title: string;
  prompt: string;
  createdAt: string;
  lastUpdated: string;
};

export type ProjectRole = "owner" | "admin" | "editor" | "viewer";

export type ProjectPermission = {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  lastUpdated: string;
};

export type SourceControlProvider = "github";

export type SourceControlOAuthConnection = {
  id: string;
  projectId: string;
  provider: SourceControlProvider;
  username: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastUpdated: string;
};

export type SourceControlRepository = {
  id: string;
  projectId: string;
  oauthConnectionId: string;
  provider: SourceControlProvider;
  url: string;
  createdAt: string;
  lastUpdated: string;
};

export type ProjectUpdate = {
  id: string;
  projectId: string;
  stageId?: string;
  summary: string;
  details: string | null;
  createdAt: string;
};

export type WorkflowResourceSelector = {
  kind: WorkflowResourceKind;
  status: string;
  label: string;
};

export type WorkflowInputRule = WorkflowResourceSelector & {
  minimumReady: number;
};

export type WorkflowOutputRule = WorkflowResourceSelector & {
  refillWhenAtOrBelow: number;
  holdWhenAtOrAbove: number;
};

export type WorkflowStageDefinition = {
  id: string;
  name: string;
  priority: number;
  instructionsMarkdown: string;
  input: WorkflowInputRule | null;
  output: WorkflowOutputRule;
};

export type GitHubRepositoryConfig = {
  provider: "github";
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  accessToken: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  syncError: string | null;
};

export type GitHubIssueSnapshot = {
  id: string;
  kind?: "github_issue" | "github_pull_request";
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  eligibleStageIds: string[];
};

export type GitHubIssueCache = {
  issues: GitHubIssueSnapshot[];
  syncedAt: string | null;
  error: string | null;
};

export type WorkflowProjectSettings = {
  maxTaskSteps: number;
  staleAgentMinutes: number;
};

export type ManagerAgentDefinition = {
  id: string;
  name: string;
  projectId: string;
  accessToken: string;
  createdAt: string;
  accessTokenUpdatedAt: string;
};

export type WorkflowAgentStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "crashed"
  | "cancelled";

export type WorkflowManagerCycleStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "stale"
  | "cancelled"
  | "skipped";

export type WorkflowAgentRun = {
  id: string;
  name: string;
  stageId: string | null;
  stageName: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  status: WorkflowAgentStatus;
  terminalState: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  stepCount: number;
  failureReason: string | null;
};

export type WorkflowManagerCycle = {
  id: string;
  managerAgentId: string;
  stageId: string | null;
  stageName: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  status: WorkflowManagerCycleStatus;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  maxSteps: number;
  stepCount: number;
  agents: WorkflowAgentRun[];
  failureReason: string | null;
  terminalSummary: string | null;
};

export type WorkflowTaskAuditEventType =
  | "github_sync"
  | "manager_selected"
  | "agent_reported"
  | "stale_failure"
  | "step_limit_exceeded";

export type WorkflowTaskAuditEvent = {
  id: string;
  cycleId: string | null;
  agentId: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  stageId: string | null;
  stageName: string | null;
  type: WorkflowTaskAuditEventType;
  summary: string;
  createdAt: string;
  durationMs: number | null;
  stepCount: number;
  status: WorkflowAgentStatus | WorkflowManagerCycleStatus | "eligible";
};

export type WorkflowProject = {
  id: string;
  ownerUserId: string;
  title: string;
  objective: string;
  globalInstructionsMarkdown: string;
  repository: GitHubRepositoryConfig | null;
  settings: WorkflowProjectSettings;
  managerAgent: ManagerAgentDefinition;
  stages: WorkflowStageDefinition[];
  githubIssueCache: GitHubIssueCache;
  managerCycles: WorkflowManagerCycle[];
  taskAudit: WorkflowTaskAuditEvent[];
  createdAt: string;
  lastUpdated: string;
};

export type GitHubRepositoryClientConfig = Omit<GitHubRepositoryConfig, "accessToken"> & {
  hasAccessToken: boolean;
};

export type ClientWorkflowProject = Omit<WorkflowProject, "repository"> & {
  repository: GitHubRepositoryClientConfig | null;
};

export type WorkflowProjectReadModel = Omit<WorkflowProject, "repository"> & {
  repository: GitHubRepositoryConfig | GitHubRepositoryClientConfig | null;
};

export type WorkflowResourceCounts = Record<string, number>;

export type ManagerNextPrompt = {
  projectId: string;
  decision: "dispatch" | "stop" | "wait";
  reason: string | null;
  selectedStageId: string | null;
  selectedStageName: string | null;
  cycleId: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  prompt: string;
  generatedAt: string;
};

export const DEFAULT_MAX_TASK_STEPS = 20;
export const DEFAULT_STALE_AGENT_MINUTES = 90;

export const projectStatuses = ["active", "paused", "archived"] as const;

export const planTypes = ["free", "pro", "team"] as const;

export const emailVerificationStatuses = ["unverified", "pending", "verified"] as const;

export const projectRoles = ["owner", "admin", "editor", "viewer"] as const;

export const workflowResourceKinds = [
  "github_issue",
  "github_pull_request",
  "manual_task",
] as const;

export const promptTypes = [
  "manager",
  "stage",
  "north_star",
  "operations",
  "role_specifics",
  "planning_research",
  "user_defined",
] as const;

export function getStartStage(project: Project): Stage | null {
  return project.stages.find((stage) => stage.id === project.startStageId) ?? null;
}

export function getValidNextStages(stage: Stage, allStages: Stage[]): Stage[] {
  const stageIds = new Set(stage.validNextStages.map((nextStage) => nextStage.stageId));

  return allStages.filter((candidate) => stageIds.has(candidate.id));
}

export function getUserAccountLabel(user: UserAccount): string {
  const displayName = user.displayName?.trim();
  return displayName || user.email;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertProjectHasValidStartStage(project: Project): void {
  if (!getStartStage(project)) {
    throw new Error(`Project "${project.title}" must reference a valid start stage.`);
  }
}

export function summarizeProjectUpdate(update: ProjectUpdate, stages: Stage[]): string {
  if (!update.stageId) {
    return update.summary;
  }

  const stageName = stages.find((stage) => stage.id === update.stageId)?.name;
  return stageName ? `${stageName}: ${update.summary}` : update.summary;
}

export function sortWorkflowStagesByPriority(
  stages: WorkflowStageDefinition[],
): WorkflowStageDefinition[] {
  return [...stages].sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
}

export function workflowResourceKey(resource: WorkflowResourceSelector): string {
  return [resource.kind, resource.status.trim().toLowerCase(), resource.label.trim().toLowerCase()].join(
    ":",
  );
}

export function githubIssueTaskKey(issue: Pick<GitHubIssueSnapshot, "kind" | "number">): string {
  return `${issue.kind ?? "github_issue"}:${issue.number}`;
}

function normalizedStatusMatches(ruleStatus: string, issueState: GitHubIssueSnapshot["state"]): boolean {
  const normalizedStatus = ruleStatus.trim().toLowerCase();

  return normalizedStatus === issueState || normalizedStatus === (issueState === "open" ? "opened" : "closed");
}

function normalizedLabelSet(labels: string[]): Set<string> {
  return new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean));
}

export function issueMatchesWorkflowSelector(
  issue: GitHubIssueSnapshot,
  selector: WorkflowResourceSelector,
): boolean {
  const issueKind = issue.kind ?? "github_issue";

  if (!["github_issue", "github_pull_request"].includes(selector.kind) || selector.kind !== issueKind) {
    return false;
  }

  const label = selector.label.trim().toLowerCase();

  return (
    normalizedStatusMatches(selector.status, issue.state) &&
    (!label || normalizedLabelSet(issue.labels).has(label))
  );
}

export function getEligibleGitHubIssuesByStage(
  project: WorkflowProjectReadModel,
): Array<{ stage: WorkflowStageDefinition; issues: GitHubIssueSnapshot[] }> {
  return sortWorkflowStagesByPriority(project.stages).map((stage) => {
    const issues =
      stage.input && ["github_issue", "github_pull_request"].includes(stage.input.kind)
        ? project.githubIssueCache.issues.filter((issue) => issueMatchesWorkflowSelector(issue, stage.input!))
        : [];

    return { stage, issues };
  });
}

export function applyIssueEligibilityToProject(project: WorkflowProject): WorkflowProject {
  const stages = project.stages;
  const issues = project.githubIssueCache.issues.map((issue) => ({
    ...issue,
    eligibleStageIds: stages
      .filter(
        (stage) =>
          stage.input &&
          ["github_issue", "github_pull_request"].includes(stage.input.kind) &&
          issueMatchesWorkflowSelector(issue, stage.input),
      )
      .map((stage) => stage.id),
  }));

  return {
    ...project,
    githubIssueCache: {
      ...project.githubIssueCache,
      issues,
    },
  };
}

export function workflowResourceCountsFromIssues(project: WorkflowProjectReadModel): WorkflowResourceCounts {
  const counts: WorkflowResourceCounts = {};

  for (const selector of getWorkflowResourceSelectors(project)) {
    counts[workflowResourceKey(selector)] =
      ["github_issue", "github_pull_request"].includes(selector.kind)
        ? project.githubIssueCache.issues.filter((issue) => issueMatchesWorkflowSelector(issue, selector)).length
        : 0;
  }

  return counts;
}

export function getWorkflowResourceSelectors(project: WorkflowProjectReadModel): WorkflowResourceSelector[] {
  const selectors = new Map<string, WorkflowResourceSelector>();

  project.stages.forEach((stage) => {
    if (stage.input) {
      selectors.set(workflowResourceKey(stage.input), stage.input);
    }

    selectors.set(workflowResourceKey(stage.output), stage.output);
  });

  return [...selectors.values()];
}

export function getTaskStepCount(project: WorkflowProjectReadModel, taskKey: string | null): number {
  if (!taskKey) {
    return 0;
  }

  const cycleSteps = project.managerCycles
    .filter((cycle) => cycle.taskKey === taskKey)
    .reduce((total, cycle) => total + Math.max(0, Math.floor(cycle.stepCount)), 0);
  const uncycledAuditSteps = project.taskAudit
    .filter((event) => event.taskKey === taskKey && !event.cycleId && event.type !== "step_limit_exceeded")
    .reduce((total, event) => total + Math.max(0, Math.floor(event.stepCount)), 0);

  return cycleSteps + uncycledAuditSteps;
}

export function taskHasExceededStepLimit(project: WorkflowProjectReadModel, taskKey: string | null): boolean {
  return getTaskStepCount(project, taskKey) >= project.settings.maxTaskSteps;
}

export function getActiveManagerCycles(project: WorkflowProjectReadModel): WorkflowManagerCycle[] {
  return project.managerCycles.filter((cycle) => cycle.status === "running");
}

export function getFailedManagerCycles(project: WorkflowProjectReadModel): WorkflowManagerCycle[] {
  return project.managerCycles.filter((cycle) => ["failed", "blocked", "stale"].includes(cycle.status));
}

export function markStaleManagerCycles(
  project: WorkflowProject,
  now = new Date(),
): WorkflowProject {
  const staleAfterMs = project.settings.staleAgentMinutes * 60 * 1000;
  const nowTime = now.getTime();
  const staleCycles = project.managerCycles.filter((cycle) => {
    if (cycle.status !== "running") {
      return false;
    }

    const heartbeatTime = new Date(cycle.lastHeartbeatAt ?? cycle.updatedAt ?? cycle.createdAt).getTime();

    return Number.isFinite(heartbeatTime) && nowTime - heartbeatTime > staleAfterMs;
  });

  if (staleCycles.length === 0) {
    return project;
  }

  const staleCycleIds = new Set(staleCycles.map((cycle) => cycle.id));
  const auditEvents: WorkflowTaskAuditEvent[] = staleCycles.map((cycle) => ({
    id: `audit-${cycle.id}-stale`,
    cycleId: cycle.id,
    agentId: null,
    taskKey: cycle.taskKey,
    taskTitle: cycle.taskTitle,
    taskUrl: cycle.taskUrl,
    stageId: cycle.stageId,
    stageName: cycle.stageName,
    type: "stale_failure",
    summary: `Manager cycle ${cycle.id} did not report back before the stale-agent threshold.`,
    createdAt: now.toISOString(),
    durationMs: nowTime - new Date(cycle.createdAt).getTime(),
    stepCount: 0,
    status: "stale",
  }));

  return {
    ...project,
    managerCycles: project.managerCycles.map((cycle) =>
      staleCycleIds.has(cycle.id)
        ? {
            ...cycle,
            status: "stale",
            updatedAt: now.toISOString(),
            completedAt: now.toISOString(),
            failureReason: "Manager or spawned agent did not report back before the stale threshold.",
          }
        : cycle,
    ),
    taskAudit: [...project.taskAudit, ...auditEvents],
  };
}

function hasReadyInput(stage: WorkflowStageDefinition, counts: WorkflowResourceCounts): boolean {
  if (!stage.input) {
    return true;
  }

  const inputCount = counts[workflowResourceKey(stage.input)] ?? 0;

  return inputCount >= stage.input.minimumReady;
}

function isBelowOutputCap(stage: WorkflowStageDefinition, counts: WorkflowResourceCounts): boolean {
  const outputCount = counts[workflowResourceKey(stage.output)] ?? 0;

  return outputCount < stage.output.holdWhenAtOrAbove;
}

export function selectNextWorkflowStage(
  project: WorkflowProjectReadModel,
  counts: WorkflowResourceCounts = {},
): WorkflowStageDefinition | null {
  const eligibleStages = sortWorkflowStagesByPriority(project.stages).filter(
    (stage) => isBelowOutputCap(stage, counts) && hasReadyInput(stage, counts),
  );

  return (
    eligibleStages.find((stage) => {
      const outputCount = counts[workflowResourceKey(stage.output)] ?? 0;

      return outputCount <= stage.output.refillWhenAtOrBelow;
    }) ??
    eligibleStages[0] ??
    null
  );
}

export function selectNextWorkflowIssue(
  project: WorkflowProjectReadModel,
  stage: WorkflowStageDefinition | null,
): GitHubIssueSnapshot | null {
  if (!stage?.input || !["github_issue", "github_pull_request"].includes(stage.input.kind)) {
    return null;
  }

  return (
    project.githubIssueCache.issues.find((issue) => {
      const taskKey = githubIssueTaskKey(issue);

      return issueMatchesWorkflowSelector(issue, stage.input!) && !taskHasExceededStepLimit(project, taskKey);
    }) ?? null
  );
}

export function describeWorkflowResource(resource: WorkflowResourceSelector): string {
  const parts = [
    resource.kind.replaceAll("_", " "),
    resource.status ? `status "${resource.status}"` : null,
    resource.label ? `label "${resource.label}"` : null,
  ].filter(Boolean);

  return parts.join(" with ");
}

export function buildManagerAgentPrompt(
  project: WorkflowProjectReadModel,
  backendUrl = "http://127.0.0.1:3000",
): string {
  if (!project.managerAgent.accessToken) {
    throw new Error("Manager access token is missing. Rotate the manager token before copying this prompt.");
  }

  const normalizedBackendUrl = backendUrl.replace(/\/$/, "");

  return [
    `You are the BatonFlow manager agent for "${project.title}".`,
    "",
    "Your job is to ask BatonFlow what the next useful workflow action is, follow only that returned prompt, and report every spawned subagent back through the workflow system.",
    "",
    "Before doing work:",
    "1. Do not inspect or count GitHub issues or pull requests yourself. BatonFlow owns GitHub status and stage eligibility.",
    `2. Send a POST request to ${normalizedBackendUrl}/api/projects/${project.id}/manager/next.`,
    `3. Set this HTTP header: Authorization: Bearer ${project.managerAgent.accessToken}`,
    `4. Use this JSON body: ${JSON.stringify({
      managerAgentId: project.managerAgent.id,
    })}.`,
    "5. Read the JSON response and treat its `prompt` field as the authoritative next instruction.",
    `6. After dispatching or observing work, POST a report to ${normalizedBackendUrl}/api/projects/${project.id}/manager/report with the returned cycleId, status, summary, and every subagent you created.`,
    "7. For each subagent report: agent id/name, stage, task, startedAt, completedAt, status, terminalState, stepCount, durationMs, and failureReason if any.",
    "8. If a worker crashes, disappears, or never returns, report it as status `crashed` or `failed` with the last terminal state you can observe. BatonFlow will raise it for additional review.",
    "9. If the backend reports no eligible stage or a safety stop, do not invent work; report the reason and stop.",
    "",
    "Treat the bearer token as credential material. If it is rotated in BatonFlow, copy the new manager prompt before running another cycle.",
    "Do not create additional workers unless the returned prompt explicitly asks you to dispatch one. Do not bypass BatonFlow's stage priority, input, output, GitHub eligibility, stale-worker, or max-step safety rules.",
  ].join("\n");
}

export function buildManagerNextPrompt(
  project: WorkflowProjectReadModel,
  counts: WorkflowResourceCounts = {},
  cycleId: string | null = null,
): ManagerNextPrompt {
  const selectedStage = selectNextWorkflowStage(project, counts);
  const selectedIssue = selectNextWorkflowIssue(project, selectedStage);
  const stagePriority = sortWorkflowStagesByPriority(project.stages)
    .map((stage) => `${stage.priority}. ${stage.name}`)
    .join("\n");
  const taskKey = selectedIssue ? githubIssueTaskKey(selectedIssue) : null;
  const taskStepCount = getTaskStepCount(project, taskKey);

  if (!selectedStage) {
    return {
      projectId: project.id,
      decision: "stop",
      reason: "no_eligible_stage",
      selectedStageId: null,
      selectedStageName: null,
      cycleId,
      taskKey: null,
      taskTitle: null,
      taskUrl: null,
      generatedAt: new Date().toISOString(),
      prompt: [
        `No eligible stage is configured for "${project.title}".`,
        "Stop this manager cycle and update the BatonFlow project configuration before requesting more work.",
      ].join("\n"),
    };
  }

  if (
    selectedStage.input &&
    ["github_issue", "github_pull_request"].includes(selectedStage.input.kind) &&
    !selectedIssue
  ) {
    return {
      projectId: project.id,
      decision: "stop",
      reason: "no_eligible_issue_or_step_limit",
      selectedStageId: null,
      selectedStageName: null,
      cycleId,
      taskKey: null,
      taskTitle: null,
      taskUrl: null,
      generatedAt: new Date().toISOString(),
      prompt: [
        `No eligible GitHub work item can be safely dispatched for "${selectedStage.name}".`,
        `Either no item matches the stage input rule, or every matching item has reached the max step limit of ${project.settings.maxTaskSteps}.`,
        "Stop this manager cycle and leave the item for additional review.",
      ].join("\n"),
    };
  }

  const inputRule = selectedStage.input
    ? `Input: ${describeWorkflowResource(selectedStage.input)}; require at least ${selectedStage.input.minimumReady}.`
    : "Input: no upstream input is required for this stage.";
  const outputRule = `Output: ${describeWorkflowResource(selectedStage.output)}; prioritize at or below ${selectedStage.output.refillWhenAtOrBelow}, and do not run at or above ${selectedStage.output.holdWhenAtOrAbove}.`;

  return {
    projectId: project.id,
    decision: "dispatch",
    reason: null,
    selectedStageId: selectedStage.id,
    selectedStageName: selectedStage.name,
    cycleId,
    taskKey,
    taskTitle: selectedIssue?.title ?? null,
    taskUrl: selectedIssue?.url ?? null,
    generatedAt: new Date().toISOString(),
    prompt: [
      `Project: ${project.title}`,
      `Objective: ${project.objective}`,
      project.repository
        ? `Repository: ${project.repository.owner}/${project.repository.name} (${project.repository.url})`
        : "Repository: not configured; do not perform GitHub mutations.",
      "",
      "Global instructions shared by every agent:",
      project.globalInstructionsMarkdown,
      "",
      `Selected stage: ${selectedStage.name}`,
      cycleId ? `BatonFlow cycle id: ${cycleId}` : null,
      `Stage priority order:\n${stagePriority}`,
      inputRule,
      outputRule,
      selectedIssue
        ? `Selected GitHub ${selectedIssue.kind === "github_pull_request" ? "pull request" : "issue"}: #${selectedIssue.number} ${selectedIssue.title}\n${selectedIssue.url}\nCurrent task step count: ${taskStepCount}/${project.settings.maxTaskSteps}.`
        : "Selected task: queue/refill cycle; no existing GitHub work item is assigned.",
      "",
      "Stage instructions:",
      selectedStage.instructionsMarkdown,
      "",
      "Run exactly one manager cycle. Dispatch at most one worker/subagent. Include the BatonFlow cycle id in your report. Stop immediately if the task would exceed the configured max step limit.",
      "When done, report every spawned subagent to BatonFlow with status, step count, duration, terminal state, and failure reason if applicable.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function sanitizeWorkflowProjectForClient(project: WorkflowProject): ClientWorkflowProject {
  return {
    ...project,
    repository: project.repository
      ? {
          provider: project.repository.provider,
          owner: project.repository.owner,
          name: project.repository.name,
          url: project.repository.url,
          defaultBranch: project.repository.defaultBranch,
          connectedAt: project.repository.connectedAt,
          lastSyncedAt: project.repository.lastSyncedAt,
          syncError: project.repository.syncError,
          hasAccessToken: Boolean(project.repository.accessToken),
        }
      : null,
  };
}
