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

export type ManagerAgentDefinition = {
  id: string;
  name: string;
  projectId: string;
  accessToken: string;
  createdAt: string;
  accessTokenUpdatedAt: string;
};

export type WorkflowProject = {
  id: string;
  ownerUserId: string;
  title: string;
  objective: string;
  globalInstructionsMarkdown: string;
  managerAgent: ManagerAgentDefinition;
  stages: WorkflowStageDefinition[];
  createdAt: string;
  lastUpdated: string;
};

export type WorkflowResourceCounts = Record<string, number>;

export type ManagerNextPrompt = {
  projectId: string;
  selectedStageId: string | null;
  selectedStageName: string | null;
  prompt: string;
  generatedAt: string;
};

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

export function getWorkflowResourceSelectors(project: WorkflowProject): WorkflowResourceSelector[] {
  const selectors = new Map<string, WorkflowResourceSelector>();

  project.stages.forEach((stage) => {
    if (stage.input) {
      selectors.set(workflowResourceKey(stage.input), stage.input);
    }

    selectors.set(workflowResourceKey(stage.output), stage.output);
  });

  return [...selectors.values()];
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
  project: WorkflowProject,
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

export function describeWorkflowResource(resource: WorkflowResourceSelector): string {
  const parts = [
    resource.kind.replaceAll("_", " "),
    resource.status ? `status "${resource.status}"` : null,
    resource.label ? `label "${resource.label}"` : null,
  ].filter(Boolean);

  return parts.join(" with ");
}

export function buildManagerAgentPrompt(
  project: WorkflowProject,
  backendUrl = "http://127.0.0.1:3000",
): string {
  if (!project.managerAgent.accessToken) {
    throw new Error("Manager access token is missing. Rotate the manager token before copying this prompt.");
  }

  const normalizedBackendUrl = backendUrl.replace(/\/$/, "");
  const resourceCountTemplate = Object.fromEntries(
    getWorkflowResourceSelectors(project).map((selector) => [workflowResourceKey(selector), 0]),
  );

  return [
    `You are the BatonFlow manager agent for "${project.title}".`,
    "",
    "Your job is to ask BatonFlow what the next useful workflow action is, follow only that returned prompt, and report the result back through the workflow system.",
    "",
    "Before doing work:",
    "1. Inspect the live tracker state for the configured workflow resources and count matching open items by key.",
    `2. Send a POST request to ${normalizedBackendUrl}/api/projects/${project.id}/manager/next.`,
    `3. Set this HTTP header: Authorization: Bearer ${project.managerAgent.accessToken}`,
    `4. Use this JSON body, replacing the resourceCounts values with live counts: ${JSON.stringify({
      managerAgentId: project.managerAgent.id,
      resourceCounts: resourceCountTemplate,
    })}.`,
    "5. Read the JSON response and treat its `prompt` field as the authoritative next instruction.",
    "6. If the backend reports no eligible stage, do not invent work; record the reason and stop.",
    "",
    "Treat the bearer token as credential material. If it is rotated in BatonFlow, copy the new manager prompt before running another cycle.",
    "Do not create additional workers unless the returned prompt explicitly asks you to dispatch one. Do not bypass BatonFlow's stage priority, input, output, or WIP-cap rules.",
  ].join("\n");
}

export function buildManagerNextPrompt(
  project: WorkflowProject,
  counts: WorkflowResourceCounts = {},
): ManagerNextPrompt {
  const selectedStage = selectNextWorkflowStage(project, counts);
  const stagePriority = sortWorkflowStagesByPriority(project.stages)
    .map((stage) => `${stage.priority}. ${stage.name}`)
    .join("\n");

  if (!selectedStage) {
    return {
      projectId: project.id,
      selectedStageId: null,
      selectedStageName: null,
      generatedAt: new Date().toISOString(),
      prompt: [
        `No eligible stage is configured for "${project.title}".`,
        "Stop this manager cycle and update the BatonFlow project configuration before requesting more work.",
      ].join("\n"),
    };
  }

  const inputRule = selectedStage.input
    ? `Input: ${describeWorkflowResource(selectedStage.input)}; require at least ${selectedStage.input.minimumReady}.`
    : "Input: no upstream input is required for this stage.";
  const outputRule = `Output: ${describeWorkflowResource(selectedStage.output)}; prioritize at or below ${selectedStage.output.refillWhenAtOrBelow}, and do not run at or above ${selectedStage.output.holdWhenAtOrAbove}.`;

  return {
    projectId: project.id,
    selectedStageId: selectedStage.id,
    selectedStageName: selectedStage.name,
    generatedAt: new Date().toISOString(),
    prompt: [
      `Project: ${project.title}`,
      `Objective: ${project.objective}`,
      "",
      "Global instructions shared by every agent:",
      project.globalInstructionsMarkdown,
      "",
      `Selected stage: ${selectedStage.name}`,
      `Stage priority order:\n${stagePriority}`,
      inputRule,
      outputRule,
      "",
      "Stage instructions:",
      selectedStage.instructionsMarkdown,
      "",
      "Run exactly one manager cycle. Inspect live workflow state before dispatching work, respect any active worker lease or WIP cap, and return a concise handoff with the selected stage, evidence checked, work dispatched or skipped, and the next expected owner.",
    ].join("\n"),
  };
}
