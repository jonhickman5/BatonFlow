# Data Structures

These are the initial v1 data structures for BatonFlow. The product assumes that
authoritative workflow state for real project work lives in source control and
connected tools such as GitHub. BatonFlow stores configuration for local
manager/agent workflows, source-control access, permissions, and lightweight
project updates posted by local runs.

## User Account

```ts
type PlanType =
  | "free"
  | "pro"
  | "team";

type EmailVerificationStatus =
  | "unverified"
  | "pending"
  | "verified";

type UserAccount = {
  id: string;
  email: string;
  normalizedEmail: string;
  emailVerificationStatus: EmailVerificationStatus;
  phoneNumber: string | null;
  displayName: string | null;
  planType: PlanType;

  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};
```

## Project

```ts
type ProjectStatus =
  | "active"
  | "paused"
  | "archived";

type Project = {
  id: string;
  title: string;
  description: string | null;

  stages: Stage[];
  startStageId: string;

  status: ProjectStatus;

  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};
```

## Stage

```ts
type ValidNextStage = {
  stageId: string;
  description?: string;
};

type Stage = {
  id: string;
  name: string;
  validNextStages: ValidNextStage[];
  promptId: string;
  additionalContextPromptIds: string[];
};
```

## Prompt

```ts
type PromptType =
  | "manager"
  | "stage"
  | "north_star"
  | "operations"
  | "role_specifics"
  | "planning_research"
  | "user_defined";

type Prompt = {
  id: string;
  projectId: string;
  type: PromptType;
  title: string;
  prompt: string;

  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};
```

## Project Permission

```ts
type ProjectRole =
  | "owner"
  | "admin"
  | "editor"
  | "viewer";

type ProjectPermission = {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;

  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};
```

## Source Control

```ts
type SourceControlProvider =
  | "github";

type SourceControlOAuthConnection = {
  id: string;
  projectId: string;

  provider: SourceControlProvider;
  username: string;

  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  expiresAt: string | null; // ISO datetime

  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};

type SourceControlRepository = {
  id: string;
  projectId: string;
  oauthConnectionId: string;

  provider: SourceControlProvider;
  url: string;

  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};
```

## Project Update

```ts
type ProjectUpdate = {
  id: string;
  projectId: string;

  stageId?: string;

  summary: string;
  details: string | null;

  createdAt: string; // ISO datetime
};
```

## Local Workflow Project Store

The signed-in home currently persists workflow projects to a local JSON file
through the `ProjectStore` interface. The default implementation writes
`.data/batonflow-projects.json`, which is intentionally ignored by git. This
keeps the first persistence mechanism simple while preserving an interface that
can later be backed by Prisma, SQLite, GitHub, or another store.

```ts
type WorkflowResourceKind =
  | "github_issue"
  | "github_pull_request"
  | "manual_task";

type WorkflowResourceSelector = {
  kind: WorkflowResourceKind;
  status: string;
  label: string;
};

type WorkflowInputRule = WorkflowResourceSelector & {
  minimumReady: number;
};

type WorkflowOutputRule = WorkflowResourceSelector & {
  refillWhenAtOrBelow: number;
  holdWhenAtOrAbove: number;
};

type WorkflowStageDefinition = {
  id: string;
  name: string;
  priority: number;
  instructionsMarkdown: string;
  input: WorkflowInputRule | null;
  output: WorkflowOutputRule;
};

type GitHubRepositoryConfig = {
  provider: "github";
  githubRepositoryId?: number;
  owner: string;
  name: string;
  fullName?: string;
  url: string;
  defaultBranch: string;
  accessToken?: string;      // legacy/server-only fallback; not sent to clients
  connectedAt: string;       // ISO datetime
  lastSyncedAt: string | null;
  syncError: string | null;
};

type GitHubAccountConnection = {
  userId: string;
  githubUserId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  accessToken: string;       // server-only OAuth token
  tokenType: string;
  scope: string;
  connectedAt: string;       // ISO datetime
  lastUpdated: string;       // ISO datetime
};

type ClientGitHubAccountConnection = Omit<GitHubAccountConnection, "accessToken"> & {
  scopes: string[];
};

type GitHubRepositorySummary = {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;         // ISO datetime
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
};

type GitHubIssueSnapshot = {
  id: string;
  kind?: "github_issue" | "github_pull_request";
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  createdAt: string;         // ISO datetime
  updatedAt: string;         // ISO datetime
  eligibleStageIds: string[];
};

type GitHubIssueCache = {
  issues: GitHubIssueSnapshot[];
  syncedAt: string | null;
  error: string | null;
};

type WorkflowProjectSettings = {
  maxTaskSteps: number;      // default: 20
  staleAgentMinutes: number; // default: 90
};

type ManagerAgentDefinition = {
  id: string;
  name: string;
  projectId: string;
  accessToken: string;
  createdAt: string; // ISO datetime
  accessTokenUpdatedAt: string; // ISO datetime
};

type WorkflowAgentStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "crashed"
  | "cancelled";

type WorkflowManagerCycleStatus =
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "stale"
  | "cancelled"
  | "skipped";

type WorkflowAgentRun = {
  id: string;
  name: string;
  stageId: string | null;
  stageName: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  status: WorkflowAgentStatus;
  terminalState: string | null;
  startedAt: string;         // ISO datetime
  completedAt: string | null;
  durationMs: number | null;
  stepCount: number;
  failureReason: string | null;
};

type WorkflowManagerCycle = {
  id: string;
  managerAgentId: string;
  stageId: string | null;
  stageName: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  status: WorkflowManagerCycleStatus;
  prompt: string;
  createdAt: string;         // ISO datetime
  updatedAt: string;         // ISO datetime
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  maxSteps: number;
  stepCount: number;
  agents: WorkflowAgentRun[];
  failureReason: string | null;
  terminalSummary: string | null;
};

type WorkflowTaskAuditEvent = {
  id: string;
  cycleId: string | null;
  agentId: string | null;
  taskKey: string | null;
  taskTitle: string | null;
  taskUrl: string | null;
  stageId: string | null;
  stageName: string | null;
  type:
    | "github_sync"
    | "manager_selected"
    | "agent_reported"
    | "stale_failure"
    | "step_limit_exceeded";
  summary: string;
  createdAt: string;         // ISO datetime
  durationMs: number | null;
  stepCount: number;
  status: WorkflowAgentStatus | WorkflowManagerCycleStatus | "eligible";
};

type WorkflowProject = {
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
  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};

type GitHubRepositoryClientConfig = Omit<GitHubRepositoryConfig, "accessToken"> & {
  hasAccessToken: boolean;
};

type ClientWorkflowProject = Omit<WorkflowProject, "repository"> & {
  repository: GitHubRepositoryClientConfig | null;
};
```

Every workflow project gets one manager agent automatically. Users define the
global Markdown instructions and any number of stages. Each stage has its own
Markdown instruction set, priority number, optional input rule, and required
output rule.

The local project file stores the manager agent bearer token so the copyable
manager prompt can be reproduced after a reload. Repository attachment stores
repository metadata on the project; the GitHub OAuth token lives on the signed-in
user's account connection in the auth store. Treat `.data` as local credential
material. Rotating the manager token from the project home invalidates older
copied prompts.

Repository association is one-to-one for now: one workflow project can reference
one GitHub repository. The OAuth token is only used server-side. Server-rendered
pages pass `ClientGitHubAccountConnection` and `ClientWorkflowProject` to the
browser so the UI can show connection and repository status without serializing
the GitHub access token.

Output rules drive stage WIP caps. For example, a planning stage can produce
GitHub issues labeled `Pending Architecture`, prioritize when there are `0`, and
hold when there are already `3`. An architecture stage can consume issues
labeled `Pending Architecture` and produce issues labeled
`Pending Implementation`, with a hold cap of `1` so implementation work is
prioritized before additional architecture. Review stages can consume cached
GitHub pull requests the same way.

The dashboard derives work-item eligibility from cached GitHub issues and pull
requests, each stage input rule, and each item's labels/status. It also shows
active manager cycles, failed/stale/crashed work, and a task audit timeline so a
task's history can be followed through each stage.

The manager prompt tells a Codex manager agent to call:

```http
POST /api/projects/:projectId/manager/next
```

The request must include an `Authorization: Bearer <manager-token>` header. The
body includes the project manager agent id. BatonFlow validates the manager
bearer token and manager agent id, marks stale cycles, syncs GitHub issues and
pull requests when a repository is configured, computes resource counts itself, and returns an
authoritative prompt with a `dispatch`, `wait`, or `stop` decision. A running
cycle blocks another manager cycle until it reports back or becomes stale.

After dispatching or observing work, the manager must call:

```http
POST /api/projects/:projectId/manager/report
```

The report includes the cycle id, manager agent id, status, terminal summary,
step count, and every spawned subagent with status, terminal state, duration,
step count, and failure reason. BatonFlow stores those runs in the cycle and
adds audit events. Reports with failed or crashed agents mark the cycle as
failed. A task whose accumulated cycle steps reaches `maxTaskSteps` is blocked
from further dispatch and creates a `step_limit_exceeded` audit event without
double-counting that marker as additional work.

## Database Mapping

The Prisma schema stores stages, valid next-stage edges, prompts, permissions,
source-control records, and updates as separate rows. The TypeScript `Project`
shape embeds `stages` because that is the domain shape the UI and prompt
generator need after loading a project.

Project-scoped relations should remain project-scoped in the database. For
example, a stage can only reference a prompt in the same project and a
next-stage edge can only connect stages in the same project. GitHub account
connections are user-scoped so a signed-in user can connect GitHub once and
attach one accessible repository to each workflow project.

User account uniqueness is enforced through `normalizedEmail`, which stores the
trimmed lowercase email value. The display `email` can preserve user-facing
formatting, but account lookup and uniqueness should use `normalizedEmail`.
