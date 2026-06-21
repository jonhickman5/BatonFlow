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

type ManagerAgentDefinition = {
  id: string;
  name: string;
  projectId: string;
  accessToken: string;
  createdAt: string; // ISO datetime
  accessTokenUpdatedAt: string; // ISO datetime
};

type WorkflowProject = {
  id: string;
  ownerUserId: string;
  title: string;
  objective: string;
  globalInstructionsMarkdown: string;
  managerAgent: ManagerAgentDefinition;
  stages: WorkflowStageDefinition[];
  createdAt: string;    // ISO datetime
  lastUpdated: string;  // ISO datetime
};
```

Every workflow project gets one manager agent automatically. Users define the
global Markdown instructions and any number of stages. Each stage has its own
Markdown instruction set, priority number, optional input rule, and required
output rule.

The local project file stores the manager agent bearer token so the copyable
manager prompt can be reproduced after a reload. Treat `.data` as local
credential material. Rotating the manager token from the project home invalidates
older copied prompts.

Output rules drive stage WIP caps. For example, a planning stage can produce
GitHub issues labeled `Pending Architecture`, prioritize when there are `0`, and
hold when there are already `3`. An architecture stage can consume issues
labeled `Pending Architecture` and produce issues labeled
`Pending Implementation`, with a hold cap of `1` so implementation work is
prioritized before additional architecture.

The manager prompt tells a Codex manager agent to call:

```http
POST /api/projects/:projectId/manager/next
```

The request must include an `Authorization: Bearer <manager-token>` header. The
body includes the project manager agent id plus `resourceCounts`, a map keyed by
`kind:status:label`. The manager agent is responsible for filling those counts
from live tracker state before asking for the next action. The backend validates
the manager bearer token and manager agent id, evaluates configured stage
priority, input readiness, refill thresholds, and output caps from those counts,
then returns an authoritative prompt for the next manager cycle.

## Database Mapping

The Prisma schema stores stages, valid next-stage edges, prompts, permissions,
source-control records, and updates as separate rows. The TypeScript `Project`
shape embeds `stages` because that is the domain shape the UI and prompt
generator need after loading a project.

Project-scoped relations should remain project-scoped in the database. For
example, a stage can only reference a prompt in the same project, a next-stage
edge can only connect stages in the same project, and a repository can only use
an OAuth connection from the same project.

User account uniqueness is enforced through `normalizedEmail`, which stores the
trimmed lowercase email value. The display `email` can preserve user-facing
formatting, but account lookup and uniqueness should use `normalizedEmail`.
