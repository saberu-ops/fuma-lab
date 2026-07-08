# Plan: Release Governance and DevOps Pipeline

## Purpose

Turn the branch-promotion idea into a concrete DevOps / release engineering
architecture for Fuma Lab:

```text
local/dev -> stg branch -> staging validation -> master branch -> production
```

This plan is documentation-first. It does not claim the pipeline exists yet.

## Level

Architecture / DevOps / release engineering.

Review focus:

- Branch and environment separation.
- Image immutability and rollback.
- Automatic deployment safety.
- Product acceptance before production.
- Future expansion without duplicating scripts.

## Source Context

Current relevant files:

- `docs/features/fumadocs/operations.md`: current operational source of truth.
- `scripts/deploy.sh`: production-oriented deployment with rollback.
- `compose.yaml`: current Docker Compose topology.
- `docs/features/staging/operations.md`: proposed staging runbook in the current
  working tree.
- `scripts/staging.sh`: proposed staging lifecycle helper in the current working
  tree.

## Key Decision

Do not let the existing staging helper define the architecture.

The target architecture is a promotion pipeline with explicit release artifacts:

- `fuma-lab:local` for local/dev only.
- Immutable commit SHA image tags for staging and production.
- Optional environment pointer tags such as `fuma-lab:stg` and
  `fuma-lab:prod`.
- Shared deployment core for staging and production.
- Branch-triggered automation after the manual model is reviewed.

## Scope

Add a long-lived architecture document:

- `docs/architecture/release-governance.md`

It should cover:

- Goals and principles.
- Environment model.
- Branch promotion model.
- Release artifact model.
- Configuration model.
- Deployment entry points.
- Automated gates.
- Product acceptance.
- Rollback.
- Observability.
- Security.
- Phased roadmap.
- Current staging-change assessment.

Add this plan and a review record under:

- `docs/architecture/notes/`

## Out of Scope

- Implementing CI/CD in this round.
- Rewriting `scripts/deploy.sh` or `scripts/staging.sh`.
- Changing `compose.yaml`.
- Updating production operations commands before the target model is implemented.
- Creating real Cloudflare resources.
- Running deployment.

## Proposed Phases

### Phase 0: Agreement

- Confirm the branch model: `feature/* -> stg -> master`.
- Confirm whether `master` is the production branch name long term.
- Confirm official production domain and staging domain.
- Confirm who can approve staging promotion.

### Phase 1: Script and Runbook Alignment

- Refactor toward one deployment entry point with `--env staging` and
  `--env production`.
- Keep local/dev default lightweight.
- Add staging rollback.
- Update `docs/features/fumadocs/operations.md` only for behavior that is
  actually implemented.

### Phase 2: Automation

- Add CI trigger for `stg`.
- Add CI trigger for `master`.
- Build immutable commit SHA images.
- Record image digest, Git SHA, environment, smoke result, and rollback target.

### Phase 3: Promotion Gate

- Require staging success before production.
- Add product acceptance record.
- Fail production deployment when production config contains staging-only flags
  or placeholder values.

### Phase 4: Platform Hardening

- Add deployment history.
- Add monitoring and alerting.
- Consider infrastructure as code for Cloudflare tunnel and Access config.

## Acceptance Criteria For This Documentation Round

- The architecture document clearly distinguishes current behavior from target
  behavior.
- The plan is not biased toward the current staging implementation.
- The model preserves local developer speed.
- The model supports automatic staging and production deployment.
- The model gives production a reliable rollback path.
- Product validation is part of the release process, not an afterthought.

## Verification

Documentation-only checks:

- Markdown paths are under `docs/architecture`.
- No production behavior is changed.
- No deployment is required.
- `git diff --check` passes.
