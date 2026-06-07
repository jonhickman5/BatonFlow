# Data Structures

These are the initial v1 data structures for BatonFlow. The product assumes that
authoritative workflow state for real project work lives in source control and
connected tools such as GitHub. BatonFlow stores configuration for local
manager/agent workflows, source-control access, permissions, and lightweight
project updates posted by local runs.

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
  username: string;
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
