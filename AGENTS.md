<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BatonFlow Agent Instructions

These instructions apply to every agent working in this repository.

## Required Local Workflow

- Make changes from a fresh clone inside `/Users/jonhickman/BatonFlow`.
- Delete that fresh clone when the work is complete.
- Do not rely on dirty state from another local checkout.
- Keep changes scoped to the requested task.
- Do not revert edits from other agents or users unless explicitly asked.

## Verification

Run the full regression and e2e suite before presenting work:

```sh
npm run verify
```

This includes:

- linting
- TypeScript checks
- Prisma schema validation
- unit tests with a 90% coverage threshold
- Playwright e2e tests

Add or update tests whenever behavior, data structures, or user-facing flows change.

## Review Handoff

Before presenting a PR as ready:

1. Run the full verification suite.
2. Spawn an independent subagent with no inherited context to review the changes.
3. Address or explicitly justify every review suggestion.
4. Rerun affected verification after changes.
5. Present the branch or PR to Jon for review and merge.

## Product Shape

BatonFlow stores workflow configuration, prompt structure, permissions, source-control connection metadata, and lightweight project updates. Authoritative runtime workflow state should remain in GitHub/source control and connected work trackers.
