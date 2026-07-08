# Fuma Lab Agent Instructions

## Project workflow

- Treat `docs/features/fumadocs/operations.md` as the operational source of
  truth.
- Use `docs/architecture/` for cross-cutting architecture proposals, ADR-style
  decisions, governance models, and architecture reviews. Do not force these
  materials under `docs/features/` unless they document an implemented feature
  or operational capability.
- Use `docs/features/` for implemented feature guides and current operational
  runbooks. Future-state architecture belongs in `docs/architecture/` until it
  is implemented and promoted into the runbook.
- Use `npm run verify` for changes that will not be deployed. Do not run it
  separately when `npm run deploy` will perform the same checks in Docker.
- Add a round changelog under `docs/reviews/` for code or application
  configuration changes. Do not use `docs/reviews/` for standalone architecture
  notes unless they accompany an implementation round.
- Do not run `npm run docs:sync` unless the user explicitly asks to refresh the
  upstream Fumadocs snapshot.

## Automatic local deployment

- After a user-requested task changes application-visible code, configuration,
  generated data, static assets, or files under `content/docs/`, invoke the
  `$deploy-fuma-lab` skill before completing the task.
- Skip deployment when the user explicitly says not to deploy, when the task is
  read-only review or diagnosis, or when validation has failed.
- Use `npm run deploy` as the single deployment entry point. Do not reconstruct
  its Docker commands manually.
- Never bypass failed checks or disable automatic rollback to force a release.
- Do not commit or push changes unless the user explicitly requests it.
- Report the deployed image ID, rollback tag, health result, and whether the
  deployed working tree contains uncommitted changes.

## Generated listening material

- When an audio source, subtitle source, or
  subtitle calibration/build script changes, run `npm run subtitles:build`
  followed by `npm run audio:build` before deployment.
- Preserve supplied source media and subtitle files unless the user explicitly
  asks to replace them.
