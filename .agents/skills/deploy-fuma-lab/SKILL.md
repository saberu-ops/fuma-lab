---
name: deploy-fuma-lab
description: Validate and deploy the Fuma Lab documentation service with image preservation, health checks, smoke tests, and automatic rollback. Use after changing application-visible code, configuration, generated data, static assets, or content/docs files; when the user asks to deploy, publish, release, update the running docs, or redeploy; or when invoking $deploy-fuma-lab explicitly.
---

# Deploy Fuma Lab

Deploy the current workspace through the repository's reviewed, deterministic
entry point.

## Workflow

1. Work from the repository root.
2. Inspect `git status --short`. A dirty tree is allowed because this local
   service is often used to preview uncommitted material; report it afterward.
3. If an audio source, subtitle source, or
   `scripts/build-listening-exam.mjs` changed, run `npm run audio:build` first.
4. Run `npm run deploy` exactly. Do not reconstruct or selectively skip its
   validation, Docker, health-check, smoke-test, or rollback steps.
5. On success, report the emitted `DEPLOYED_IMAGE`, `ROLLBACK_TAG`,
   `SERVICE_HEALTH`, and `WORKING_TREE` values.
6. On failure before container replacement, diagnose the validation or build
   error; the running service remains unchanged.
7. On failure after replacement, confirm whether the script reports a verified
   automatic rollback. Treat an unverified rollback as a critical operational
   issue.

## Guardrails

- Do not deploy when the user explicitly opts out, the task is read-only, or
  validation is failing.
- Do not pass `--check-only` when the user expects the running service to
  update.
- Do not commit, push, synchronize upstream snapshots, or discard unrelated
  working-tree changes as part of deployment.
- Do not force a broken release by setting weaker commands or bypassing checks.
