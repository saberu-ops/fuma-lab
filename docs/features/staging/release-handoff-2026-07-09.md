# Staging release handoff - 2026-07-09

This handoff records the release work completed up to the staging environment.
It deliberately stops before production promotion. Production must proceed by a
pull request into `main` or `master`, not by a direct push.

## Scope

| Item | Value |
| --- | --- |
| Commit | `4e2ae53865e138bc166429e4e263d803e7e60960` |
| Feature branch | `feat/staging-environment` |
| Staging branch | `stg` |
| Staging URL | `https://stg.t3s7.com` |
| Staging environment | GitHub Environment `staging` |
| Staging runner | `taoziyoyo-fuma-lab` (`self-hosted`, `fuma-lab`) |
| Staging tunnel model | Host-managed `cloudflared.service` |

## Completed

- Pushed commit `4e2ae53865e138bc166429e4e263d803e7e60960` to
  `feat/staging-environment`.
- Pushed the same commit to `stg`.
- GitHub Actions `CI` passed on `feat/staging-environment`.
- GitHub Actions `CI` passed on `stg`.
- GitHub Actions `Deploy Staging` passed on `stg`.
- GitHub recorded a successful deployment for environment `staging` and the
  same commit SHA.
- Operator opened `https://stg.t3s7.com` in a browser and confirmed the staging
  site works.

## Staging Evidence

| Check | Result |
| --- | --- |
| Feature branch CI | success |
| `stg` branch CI | success |
| `Deploy Staging` | success |
| GitHub staging deployment | success for `4e2ae53865e138bc166429e4e263d803e7e60960` |
| Browser verification | passed by operator on `https://stg.t3s7.com` |
| Staging secrets | none required for the default host-managed tunnel model |

The staging deployment run was:

```text
Workflow: Deploy Staging
Branch: stg
SHA: 4e2ae53865e138bc166429e4e263d803e7e60960
Conclusion: success
```

## Boundary

Allowed agent operations stop at:

```text
feature/* -> stg -> staging deployment -> staging verification
```

The next step is outside the agent's direct-push boundary:

```text
stg -> pull request -> main/master -> production workflow
```

Do not directly push to `main` or `master`. Do not approve or trigger
production deployment as a substitute for the pull request. The production
workflow may listen to `main`, but updates to that branch must come through the
reviewed PR path.

## Follow-up Controls

The staging path is now usable, but production branch governance still needs a
hard repository rule:

- Protect `main` or apply a repository ruleset.
- Require pull requests before merging.
- Block direct pushes to `main`.
- Require CI checks before merge.
- Require review before merge.

Until that rule is configured, the PR-only production policy depends on operator
discipline rather than GitHub enforcement.
