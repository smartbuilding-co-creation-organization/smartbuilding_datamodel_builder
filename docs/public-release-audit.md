# Public release audit

Audit date: 2026-08-04

## Bundled material

- No image or font files are bundled.
- Runtime HTML contains no external font, CDN, analytics, or API request.
- `schema/`, `packages/fixtures/`, and `sample/` contain project schema and synthetic building data without personal information.
- W3C WoT JSON Schema provenance and license are recorded in `THIRD_PARTY_NOTICES.md`.

## Git history metadata

Historical commits expose the following author addresses. They are Git author metadata, not application secrets, and the history was not rewritten:

- `t.kasuya@gmail.com`
- `takashi.kasuya@me.com`
- `kasuya@hongo.wide.ad.jp`
- `noreply@anthropic.com`

## Secret and dependency checks

- Gitleaks v8.28.0 full-history result: 32 commits and approximately 1.46 MB scanned; no leaks found.
- Gitleaks v8.28.0 current-worktree result: approximately 1.11 MB scanned; no leaks found.
- `pnpm audit --audit-level high` result: no known vulnerabilities found.

If a real credential is found later, revoke or rotate it before discussing any history rewrite. Rewriting public Git history requires explicit maintainer approval and contributor coordination.
