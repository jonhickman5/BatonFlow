export type ProjectStatus = "active" | "paused" | "archived";

export type PlanType = "free" | "pro" | "team";

export type EmailVerificationStatus = "unverified" | "pending" | "verified";

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

export const projectStatuses = ["active", "paused", "archived"] as const;

export const planTypes = ["free", "pro", "team"] as const;

export const emailVerificationStatuses = ["unverified", "pending", "verified"] as const;

export const projectRoles = ["owner", "admin", "editor", "viewer"] as const;

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
