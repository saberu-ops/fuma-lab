# Review: Release Governance Proposal

## Summary

The proposed release-flow architecture is directionally sound. It reframes the
current staging discussion from "add a staging helper" to "create a governed
promotion pipeline". That is the right level for future expansion.

## Findings

### 1. The proposal correctly separates local dev from release environments

`fuma-lab:local` remains useful for developer speed, but the proposal avoids
using it as a staging or production release artifact. This is important because
mutable local tags are hard to audit and weak rollback targets.

Severity: important, addressed by the proposal.

### 2. The proposal avoids overfitting to the current working tree

The current staging change adds useful pieces, but it should not define the
release architecture. The proposal explicitly calls for shared staging/prod
deployment logic, immutable image tags, and branch-triggered automation.

Severity: important, addressed by the proposal.

### 3. The proposal keeps operations documentation honest

It states that `docs/features/fumadocs/operations.md` remains the operational
source of truth until the new workflow is implemented. This prevents future CI/CD
goals from being documented as current operating procedure.

Severity: important, addressed by the proposal.

### 4. Product acceptance is present but needs a concrete owner

The architecture includes a staging acceptance template, but it does not yet
name who approves production promotion. That should be decided before automation
enforces the gate.

Severity: medium.

Recommended follow-up: define acceptance owner or role in Phase 0.

### 5. CI/CD provider is intentionally unspecified

This is acceptable for the architecture document. The next implementation plan
must choose where automation runs: GitHub Actions, host-side pull deployment,
self-hosted runner, or another controlled mechanism.

Severity: medium.

Recommended follow-up: make CI/CD provider selection the first implementation
decision after the document is approved.

### 6. Cloudflare configuration remains a future hardening item

The proposal recommends infrastructure as code later, not immediately. That is
reasonable for the current project size, but the staging runbook must still
record the dashboard state well enough to rebuild it manually.

Severity: low.

Recommended follow-up: add a Cloudflare config checklist when staging is
implemented.

## Architecture Verdict

Approve the direction.

The main correction before implementation is to treat deployment as a shared
environment-aware system, not as separate production and staging scripts that
will drift. The next round should implement the smallest useful version of that
system:

- One deployment interface.
- Two environment profiles.
- Immutable image identity.
- Staging rollback.
- Updated operations runbook reflecting only implemented behavior.

## Product Verdict

Approve with one condition: staging promotion needs a named acceptance rule.

The release process should answer:

- What changed?
- Where was it verified?
- Who accepted it for production?
- What known risk remains?

Without that, staging becomes another technical environment rather than a real
product gate.

## DevOps Verdict

Approve with phased implementation.

Do not jump directly to full platform automation. First make the manual
environment-aware deployment path correct and reversible; then wire it to branch
automation.

## Verification

This is a documentation review. No application code, configuration, generated
data, static assets, or `content/docs` files were changed by this proposal.
Deployment is not required for this review round.
