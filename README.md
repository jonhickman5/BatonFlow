# BatonFlow

BatonFlow is a workflow setup and coordination tool for manager-orchestrated
local AI agent workflows. It stores project configuration and prompt structure
while leaving authoritative project state in GitHub and source control.

## Getting Started

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

Local development uses git-ignored JSON files by default so account creation and
workflow setup work without a running Postgres server. Account records, password
hashes, and sessions are stored at `.data/batonflow-auth.json`; workflow projects
are stored at `.data/batonflow-projects.json`.

Signed-in workflow projects are stored locally at `.data/batonflow-projects.json`
by default. Set `BATONFLOW_PROJECT_STORE_PATH` to point the app at a different
local JSON file while keeping the same persistence interface. This file contains
manager bearer tokens for copied manager prompts. GitHub OAuth connections are
stored in the auth store, and projects keep only repository metadata for new
connections. Treat both local data files as credential material.

To enable repository selection, create a GitHub OAuth app and set
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`. `GITHUB_REDIRECT_URI` is
optional; when omitted, BatonFlow uses `/api/github/callback` on the configured
backend URL. Users sign in to GitHub from BatonFlow, then choose from the
repositories their connected account can access.

Each project can be associated with one GitHub repository. BatonFlow uses the
connected GitHub account server-side to sync open GitHub issues and pull
requests, compute stage eligibility from labels and status, and enforce
configured work-in-progress caps. The copied manager prompt and browser UI only
include the BatonFlow manager token; they do not expose the GitHub OAuth token.

Manager agents call `POST /api/projects/:projectId/manager/next` to ask
BatonFlow what to do next. BatonFlow syncs GitHub work items, blocks duplicate
active cycles, selects the next eligible stage, and starts a manager cycle.
Managers must then call `POST /api/projects/:projectId/manager/report` with the
cycle id, spawned subagents, terminal state, duration, and step counts. The
project dashboard shows current GitHub work-item eligibility, active and failed
cycles, stale/crashed work, and the task audit history.

Set `BATONFLOW_AUTH_STORE=postgres` to use the Prisma/Postgres-backed auth
store. Set `BATONFLOW_AUTH_STORE_PATH` to move the local auth JSON file. Both
local JSON files contain credential material and must stay out of source control.

## Database

The schema is defined in [prisma/schema.prisma](prisma/schema.prisma).

For local database-backed development, point `DATABASE_URL` at a Postgres
database and apply migrations:

```bash
npm exec prisma migrate dev
```

Committed migrations live in [prisma/migrations](prisma/migrations).

## Verification

```bash
npm run verify
```

The verification script runs linting, TypeScript checks, Prisma schema
validation, unit tests with a 90% coverage threshold, and Playwright e2e tests.

## Documentation

- [Data Structures](docs/data-structures.md)

## Stack

- Next.js
- TypeScript
- Prisma
- Vitest
- Playwright

## Source Of Truth

Runtime workflow state belongs in GitHub/source control. BatonFlow keeps the
configuration that helps local Codex or Claude Code manager prompts operate on
that state.
