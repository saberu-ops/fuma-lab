# Plan — Staging environment on `stg.t3s7.com` via containerized Cloudflare Tunnel

> Superseded by `docs/architecture/release-governance.md` and
> `round2-2026-07-08.changelog.md`. This file records the initial manual staging
> plan before the deployment model was refactored into a shared
> staging/production deployment entry point.

- Date: 2026-07-08
- Branch: `feat/staging-environment` (base `main` @ 7b25dc2)
- Level: **Architecture** (new deployment surface + external interface + cross-component config)
- Status: **approved + implemented** — see `round1-2026-07-08.changelog.md`
  (refined during the round to safe-by-default per operator feedback)

## §0 Best-practice pre-check (W-R18)

- **Multi-env Compose**: current guidance favors *one* parameterized base file
  driven by per-env `--env-file`, over parallel full compose files that drift.
  Our `compose.yaml` is already parameterized (`${SITE_URL}`, `${DOCS_PORT}`),
  so we extend it, not fork it. (Docker Recipes; EnvManager 2026.)
- **cloudflared in Compose**: run as a service with `TUNNEL_TOKEN` via
  `environment:` sourced from a gitignored env file (keeps the token off the
  command line — the prod host tunnel currently exposes its token in `ps`,
  which we will NOT repeat). Token-based tunnel = remotely-managed; the
  `hostname → service` map is set once in the Zero Trust dashboard. (Cloudflare
  One docs; Bobbland.)
- **Next.js `metadataBase`** is build-time; a correct staging canonical/OG/
  sitemap requires a per-env build (chosen). (Next.js env guide.)
- **Verified locally this session**: `docker compose --env-file <f>` honors
  `COMPOSE_PROJECT_NAME` and `COMPOSE_PROFILES` set *inside* `<f>` → one command
  yields project isolation (`fuma-lab-stg`) + tunnel opt-in.

## Purpose

A near-identical-to-prod staging environment on `stg.t3s7.com`, brought up on the
same host by binding one staging config, for pre-release testing. Isolated from
production; access-controlled; not search-indexed.

## Scope (this round)

1. `compose.yaml` — add a `cloudflared` service under `profiles: ["tunnel"]`
   (image pinned, hardened, `TUNNEL_TOKEN` via `environment`, reaches
   `http://docs:3000` over the compose network). Prod path unchanged.
2. `next.config.mjs` — add `headers()` emitting `X-Robots-Tag: noindex, nofollow`
   for all routes, gated on `process.env.ROBOTS_NOINDEX === '1'` (baked into the
   staging build only).
3. `envs/staging.env.example` + `envs/production.env.example` (committed
   templates) and the real gitignored `envs/staging.env` (operator fills token).
4. `.gitignore` — add `envs/*.env` with `!envs/*.env.example` (current `.env*`
   rules do NOT cover `envs/staging.env` — secret-leak risk without this).
5. `scripts/staging.sh` — lifecycle wrapper (`up` / `down` / `rebuild` / `logs` /
   `smoke`) around `docker compose --env-file envs/staging.env`. Reuses the prod
   smoke checks against `127.0.0.1:${DOCS_PORT}`. **Safety guard**: after loading
   the env file it asserts the resolved `COMPOSE_PROJECT_NAME == fuma-lab-stg`
   and aborts otherwise, so the staging tool can never act on the prod project.
6. `docs/features/staging/operations.md` — runbook incl. the Cloudflare dashboard
   prerequisites and an explicit "never run bare `docker compose` in this dir"
   warning (a bare invocation defaults to project `fuma-lab` = **production**).

### Mis-operation protection (operator concern, folded in)

The real footgun is a bare `docker compose up` in the repo dir defaulting to
project `fuma-lab` and recreating the **prod** container. Mitigations:
- `envs/production.env.example` pins `COMPOSE_PROJECT_NAME=fuma-lab` so prod ops
  are also explicit/env-scoped (matches current dir-default; no behavior change).
- `scripts/staging.sh` guard (above) makes the staging path structurally unable
  to touch prod.
- Runbook documents the bare-compose hazard.
- `deploy.sh` (prod) is unchanged and already scopes to `SERVICE=docs`.

## Out of scope (deferred / suggestions)

- Modifying `scripts/deploy.sh` (prod destructive-sink script) — staging gets its
  own lighter lifecycle tool; leaving deploy.sh untouched avoids a §3 external
  review on the critical prod path.
- Migrating prod's host systemd tunnel into Compose.
- Single-image-across-envs (runtime `metadataBase`) — rejected in favor of
  build-per-env.
- CI/CD automation of staging.

## Isolation model (why prod is safe)

| Axis | Prod | Staging |
|---|---|---|
| Compose project | `fuma-lab` (dir default) | `fuma-lab-stg` (env file) |
| Host port | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Image tag | `fuma-lab:local` | `fuma-lab:stg` |
| Tunnel | host systemd (token) | Compose `cloudflared` (own token, `tunnel` profile) |
| `SITE_URL` | prod domain | `https://stg.t3s7.com` |
| Indexing | indexed | `noindex` + CF Access |

Different project name = different container set/network → `docker compose
--env-file envs/staging.env up` cannot touch the prod container. cloudflared only
starts when the `tunnel` profile is active (staging env file), so prod compose
operations never start it.

## Per-change rationale

- **Profiled cloudflared**: opt-in, prod-invisible; token via `environment` (not
  argv) for `ps` hygiene; talks to `docs:3000` in-network so the tunnel needs no
  published host port.
- **`noindex` via `next.config` `headers()`**: build-gated flag is explicit and
  covers every response; belt-and-suspenders with CF Access (which already blocks
  crawlers).
- **`.gitignore` fix**: prevents committing the staging tunnel token (W-R13).
- **`scripts/staging.sh`**: gives staging a prod-parity lifecycle without editing
  the prod deploy script.

## Operator prerequisites (Cloudflare dashboard — I cannot do these)

1. Zero Trust → Networks → Tunnels → create tunnel `fuma-lab-stg` → copy token →
   paste into `envs/staging.env` `TUNNEL_TOKEN`.
2. That tunnel → Public Hostname: `stg.t3s7.com` → `http://docs:3000`.
3. Zero Trust → Access → Applications → add `stg.t3s7.com`, policy = allow your
   email. (DNS CNAME is auto-created by step 2.)

## Acceptance criteria

- `docker compose --env-file envs/staging.env config` validates; project name
  `fuma-lab-stg`; `cloudflared` present.
- `scripts/staging.sh up` builds `fuma-lab:stg` (SITE_URL baked) and serves on
  `127.0.0.1:3001`; app responds; `X-Robots-Tag: noindex` present; canonical/OG
  URLs use `stg.t3s7.com`.
- Prod container (`fuma-lab-docs-1`) untouched throughout.
- Token never staged/committed; `git check-ignore envs/staging.env` passes.

## Verification (3-gate) & what will be blocked

1. Direction — diff matches this plan.
2. Static — `docker compose … config`; `bash -n scripts/staging.sh`; `oxlint` +
   `tsc` for `next.config` change.
3. Functional — bring up the staging stack locally: app on 3001, `noindex`
   header, baked `SITE_URL`, prod container unaffected.
   **Blocked-on-operator**: the live `stg.t3s7.com` path (tunnel connect + CF
   Access) needs the real token + dashboard steps above; I will verify the
   cloudflared container *config* and local app, and mark the public path blocked.

## Cost / phasing

Medium, single round (~8 files). No TaskList needed beyond this plan; will land
as one changelog round after approval.

## Next step

Approve this plan → I implement on `feat/staging-environment`, run the 3-gate,
write the round changelog, and hand you the exact dashboard steps to finish the
live path. No merge/deploy without your go-ahead.
