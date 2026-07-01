# Plan: Complete README and Operations Documentation

## Purpose

Turn the current README into a concise project entry point and add a dedicated
operations runbook for repeatable deployment, maintenance, recovery, and
troubleshooting.

## Cost and Level

- Estimate: small to medium.
- Level: engineering.
- Review focus: command correctness, operational safety, separation of
  concerns, current configuration fidelity, and actionable incident handling.

## 0. Best-Practice Pre-check

Current implementation and records reviewed:

- `README.md`
- `Dockerfile`
- `compose.yaml`
- `package.json`
- `scripts/sync-fumadocs-reference.mjs`
- `CLAUDE.md`
- Existing Docker and offline-reference plans/changelogs

Conclusion:

- Keep README optimized for first use, project orientation, and common
  workflows.
- Put detailed operator procedures in
  `docs/features/fumadocs/operations.md`, as required by workspace governance.
- Document actual behavior only; do not add unimplemented authentication,
  reverse-proxy, monitoring, or persistence claims.
- Keep this round documentation-only.

## Scope

### README

- State purpose, current capabilities, languages, and security boundary.
- Prefer Docker as the primary quick start while retaining local development.
- Document prerequisites and URLs.
- Add a compact repository map.
- Document `DOCS_PORT` and `SITE_URL` semantics.
- Summarize content authoring, snapshot integrity, and validation commands.
- Link to the detailed operations runbook, third-party notice, and review
  records.
- Keep known limitations visible without duplicating the full runbook.

### Operations Runbook

Add procedures for:

- Service topology and invariants.
- Initial deployment and configuration preflight.
- Start, status, health, logs, restart, stop, and rebuild.
- Personal-content changes.
- Offline-reference verification and reviewed refresh.
- Node/Fumadocs dependency upgrades.
- Image tagging before changes and rollback.
- Backup and recovery for an immutable, volume-free service.
- Runtime isolation inspection.
- Resource and log behavior.
- Incident triage for unhealthy containers, port conflicts, build failures,
  snapshot integrity failures, stale metadata URLs, and upstream sync failures.
- Security posture, exposure boundary, secrets handling, and the known upstream
  PostCSS audit finding.
- Safe cleanup and command quick reference.

## Out of Scope

- Changing application, Docker, Compose, dependency, or snapshot behavior.
- Adding authentication, TLS, reverse proxy, monitoring, CI/CD, or backups.
- Claiming a tested disaster-recovery system beyond the documented source and
  image workflow.
- Resolving the upstream Next.js/PostCSS audit finding.
- Creating a language switcher or translation workflow.

## Current-State Gap Analysis

| Area | Current state | Target state |
| --- | --- | --- |
| README role | Mixed quick start and partial operations | Concise project entry point |
| Operator guide | Missing | Dedicated operations runbook |
| Configuration | Commands shown, semantics incomplete | Variable/default/rebuild table |
| Release workflow | Rebuild documented | Preflight, backup tag, deploy, verify |
| Rollback | Missing | Explicit image rollback procedure and limitations |
| Backup/recovery | Implicit Git/content model | Documented source-of-truth workflow |
| Troubleshooting | Missing | Symptom-oriented command matrix |
| Security | One exposure warning | Consolidated runtime and audit posture |
| Snapshot operations | Basic commands | Review, integrity, failure, recovery flow |

## Per-Change Rationale

- Separating onboarding from operations keeps the common path readable while
  making production procedures complete.
- Commands must match existing service name, image tag, paths, health check,
  environment interpolation, and immutable-content behavior.
- Rollback must account for the mutable `fumadocs-personal:local` tag; operators
  need to preserve a prior image before rebuilding.
- Backup guidance must reflect that there are no application volumes: source
  content and configuration are authoritative, while containers are
  disposable.
- Known security limitations need to be visible before public exposure.

## Phased Roadmap

### Phase 1: README

- Rewrite the README as the concise project entry point.
- Link detailed operational actions to the runbook.

### Phase 2: Operations Runbook

- Add the complete operator workflow and troubleshooting procedures.
- Cross-link README, snapshot provenance, and relevant implementation records.

### Phase 3: Verification and Record

- Check Markdown structure, links, paths, command names, and trailing
  whitespace.
- Execute safe referenced checks such as snapshot verification, lint, type
  checks, Compose validation, service status, and health endpoint.
- Record file manifest, omissions, verification results, and next steps in the
  round changelog.

## Acceptance Criteria

- A new maintainer can deploy the current service from README alone.
- An operator can update, inspect, troubleshoot, back up, recover, and roll back
  using the runbook without guessing service names or paths.
- README and operations documentation do not conflict or duplicate entire
  sections.
- All documented variables, defaults, paths, image names, routes, and commands
  match the current files.
- Public exposure is explicitly prohibited until access control and TLS are
  selected.
- Snapshot refresh is clearly separated from normal offline build/runtime.
- Known dependency and install-script warnings are accurately recorded.
- Documentation checks and safe referenced commands pass.
