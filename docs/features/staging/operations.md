# Staging environment — operations

Staging serves the same app as production on **`stg.t3s7.com`**, on the same
host, fully isolated from production. Access is gated by Cloudflare Access and
responses carry `X-Robots-Tag: noindex`.

## Model

| Axis | Production | Staging |
|---|---|---|
| Compose project | `fuma-lab` | `fuma-lab-stg` |
| Host port | `127.0.0.1:3000` | `127.0.0.1:3001` |
| Image | `fuma-lab:prod` | `fuma-lab:stg` |
| Tunnel | host `cloudflared` systemd | host `cloudflared` systemd |
| Deploy | `npm run deploy` / `npm run deploy:prod` | `npm run deploy:stg` |
| Indexing | indexable | `noindex` + Access |

One shared `compose.yaml` drives both; the difference is the env file selected
with `--env-file`. Staging's env file sets `COMPOSE_PROJECT_NAME=fuma-lab-stg`
and `DOCS_PORT=3001`, while the host-managed Cloudflare tunnel routes
`stg.t3s7.com` to `http://127.0.0.1:3001`.

## Safe-by-default: bare `docker compose` is a sandbox, not production

`compose.yaml` sets a default project `fuma-lab-local` on port `3009`, so a bare
`docker compose up` in this directory starts an **isolated throwaway sandbox**
that cannot touch production (different project, different port). Real
environments are always explicit:
- production → `npm run deploy` (`scripts/deploy.sh` pins
  `COMPOSE_PROJECT_NAME=fuma-lab`, `:3000`, image `fuma-lab:prod`)
- staging → `npm run deploy:stg` / `scripts/deploy.sh --env staging`
  (`COMPOSE_PROJECT_NAME=fuma-lab-stg`, `:3001`, image `fuma-lab:stg`)

So an accidental bare invocation is harmless; you must state intent to reach
production or staging.

## One-time setup

### 1. Cloudflare dashboard and host tunnel (operator — cannot be scripted here)

1. **Create the tunnel**: Zero Trust → Networks → Tunnels → *Create a tunnel*
   (Cloudflared) → use the host-installed `cloudflared.service`.
2. **Public hostname**: on that tunnel → *Public Hostname* → `stg.t3s7.com` →
   service `HTTP` → `http://127.0.0.1:3001`. This auto-creates or updates the
   `stg.t3s7.com` DNS record.
3. **Access policy**: Zero Trust → Access → Applications → *Add* → Self-hosted →
   domain `stg.t3s7.com` → policy: *Allow* your email. This keeps staging
   private (and blocks crawlers).
4. **Host check**: confirm the tunnel service is running on the deployment host:

```bash
systemctl status cloudflared --no-pager
```

### 2. Local env file

```bash
cp envs/staging.env.example envs/staging.env
# edit SITE_URL or DOCS_PORT only if the staging hostname/port changes
```

`envs/staging.env` is gitignored. Confirm:

```bash
git check-ignore envs/staging.env   # prints the path = correctly ignored
```

## Daily use

```bash
npm run deploy:stg           # build fuma-lab:stg + deploy app behind host tunnel
npm run deploy:stg:check     # build and validate staging without replacing it
scripts/staging.sh deploy    # wrapper around npm run deploy:stg
scripts/staging.sh check     # wrapper around npm run deploy:stg:check
scripts/staging.sh smoke     # local checks (app up, noindex header)
scripts/staging.sh logs      # tail staging app logs
scripts/staging.sh ps
scripts/staging.sh down      # tear down the staging stack
```

Then open **https://stg.t3s7.com** (you'll pass the Cloudflare Access login).

After the GitHub self-hosted runner and staging variables are configured, pushing
to the `stg` branch runs the same deployment path automatically through the
`Deploy Staging` workflow.

## Verifying it works

- `curl -sI http://127.0.0.1:3001/docs` → `200` and `X-Robots-Tag: noindex`.
- Page source `<link rel="canonical">` / OG URLs use `stg.t3s7.com` (baked from
  `SITE_URL` at build).
- `systemctl status cloudflared --no-pager` shows the host tunnel running.
- Production container `fuma-lab-docs-1` is untouched (`docker ps`).

## Notes

- Staging is a **separate build** of the same commit (correct canonical/OG/
  sitemap URLs), not the prod image.
- Staging deployment uses the same rollback-capable deployment script as
  production; `scripts/staging.sh` is only a small convenience wrapper for
  staging-specific lifecycle commands.
- PWA install works on `stg.t3s7.com` (its own origin) independently of prod.
- A compose-managed `cloudflared` service remains available as a fallback under
  the `tunnel` profile, but the default staging path does not require
  `TUNNEL_TOKEN` in `envs/staging.env` or GitHub Actions.
