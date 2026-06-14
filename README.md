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
