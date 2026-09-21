# Contributing

Thank you for contributing to Building Model CSV Explorer. By submitting a contribution, you agree that it is licensed under Apache-2.0.

## Development

Use Node.js 22 and pnpm 9.15.9. Read `AGENTS.md` and choose or add a task in `plans.md` before changing code.

When the work starts from a GitHub issue, follow `docs/issue-triage-workflow.md`: triage the issue against the current code, record it in `plans.md`, write the failing test first, then open one pull request per intent.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Keep each pull request focused on one intent. Include the relevant `plans.md` task, purpose, changes, affected areas, compatibility notes, and commands run. Do not commit build output, test artifacts, secrets, personal data, or unrelated formatting changes.

Use stable `data-testid` selectors for E2E tests. Core behavior should be covered by unit tests first.
