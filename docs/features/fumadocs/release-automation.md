# Release automation setup

This page is the setup checklist for the GitHub Actions release flow. The
workflow files are in this repository, but GitHub runner registration,
environment variables, host tunnel setup, and production approval rules are
external configuration.

Authoritative day-to-day production operations remain in
[`operations.md`](operations.md).

## 1. Current workflow model

| Workflow | Trigger | Runner | Result |
| --- | --- | --- | --- |
| `CI` | pull request and every branch push | GitHub-hosted `ubuntu-latest` | Validate source, docs snapshots, types, production build, and Compose config. |
| `Deploy Staging` | push to `stg`, or manual dispatch | self-hosted runner labelled `fuma-lab` | Create `envs/staging.env`, deploy staging, and record a GitHub deployment for the `staging` environment. |
| `Deploy Production` | push to `main`, or manual dispatch | GitHub-hosted gate, then self-hosted runner labelled `fuma-lab` | Require a successful `staging` deployment for the same commit SHA, then deploy production. |

The production branch is `main`, matching `origin/HEAD`. If the repository is
renamed to use `master`, update `.github/workflows/deploy-production.yml` and
this document in the same change.

## 2. Self-hosted runner

Register one GitHub self-hosted runner on the deployment host. The runner must
have the `fuma-lab` label because both deployment workflows use:

```yaml
runs-on:
  - self-hosted
  - fuma-lab
```

Use the command sequence GitHub generates for this repository:

1. Open the repository on GitHub.
2. Go to Settings -> Actions -> Runners.
3. Choose New self-hosted runner.
4. Select Linux x64.
5. Run the generated download and `config.sh` commands on the deployment host.
6. Add the label `fuma-lab` during configuration or from the runner settings.
7. Install the runner as a service so deployment jobs continue after logout.

Do not commit the runner registration token. GitHub runner registration tokens
are time-limited and should be treated as secrets.

### 2.1 GitHub token permissions

If setup is done through the GitHub web UI, no personal access token needs to be
stored on the host.

If setup is automated through `gh` or the GitHub REST API, the token must be able
to administer this repository. The simplest working option is a classic PAT with
the `repo` scope. For a fine-grained PAT, grant repository access to
`saberu-ops/fuma-lab` and include write access for repository administration,
environment configuration, secrets, and variables.

Insufficient fine-grained permissions show up as:

```text
Resource not accessible by personal access token
```

Do not run `gh auth status -t` in shared logs; it prints the full token.

### 2.2 Host prerequisites

Run these checks as the same user that will run the GitHub runner:

```bash
git --version
bash --version
docker version
docker compose version
node --version
npm --version
```

The runner user must be able to access Docker:

```bash
docker ps
```

If Docker access fails, fix the host permission model before registering the
runner. Do not run the runner as root unless there is a deliberate host security
decision to do so.

### 2.3 User service fallback

If `sudo ./svc.sh install` is unavailable, use the repository-provided user
service unit:

```bash
systemctl --user link "$PWD/ops/systemd/user/fuma-lab-actions-runner.service"
systemctl --user enable --now fuma-lab-actions-runner.service
systemctl --user status fuma-lab-actions-runner.service
```

For the runner to survive logout and host reboot, user lingering must be enabled
for `spartan` by an administrator:

```bash
sudo loginctl enable-linger spartan
```

### 2.4 Runner isolation

Only use this runner for this repository or for trusted repositories with the
same deployment boundary. A self-hosted runner can execute workflow code from
the repository, and deployment jobs have Docker access on the host.

## 3. GitHub Environments

Create two GitHub Environments:

- `staging`
- `production`

The workflow `environment.name` values must match these names exactly.

### 3.1 Staging environment

Required secrets: none in the default host-managed tunnel model.

The staging Cloudflare tunnel is configured on the deployment host and routes
`stg.t3s7.com` to `http://127.0.0.1:3001`. GitHub Actions deploys only the
staging app container and does not need the tunnel token.

Optional variables:

| Name | Type | Default |
| --- | --- | --- |
| `STAGING_SITE_URL` | variable | `https://stg.t3s7.com` |
| `STAGING_DOCS_PORT` | variable | `3001` |

Deployment branch policy:

- Enable custom branch policies.
- Allow branch `stg`.

Only use a `STAGING_TUNNEL_TOKEN` secret if the project deliberately switches
back to compose-managed `cloudflared` for staging. That is not the default
release path.

### 3.2 Production environment

Required variable:

| Name | Type | Required | Value |
| --- | --- | --- | --- |
| `PRODUCTION_SITE_URL` | variable | yes | Public production origin, for example `https://docs.example.com` |

Optional variable:

| Name | Type | Default |
| --- | --- | --- |
| `PRODUCTION_DOCS_PORT` | variable | `3000` |

Recommended protection:

- Enable required reviewers.
- Make the reviewer the product/release owner for this site.
- Do not approve production until the staging URL has been reviewed.
- Enable custom branch policies and allow branch `main`.

Current single-operator setup uses `saberu-ops` as the production required
reviewer with self-review allowed. When there is a separate product/release
owner, replace the reviewer and prevent self-review.

## 4. Promotion procedure

Use this flow for a normal release:

1. Merge or fast-forward the intended release commit into `stg`.
2. Wait for `CI` and `Deploy Staging` to succeed.
3. Open the staging URL and complete the product acceptance checklist.
4. Promote the same commit SHA to `main`.
5. Wait for `Deploy Production`.
6. If the production Environment requires approval, approve only after checking
   the staging evidence.
7. Confirm production health and smoke-test output in the workflow log.

The production workflow checks the GitHub deployment history for the exact
`GITHUB_SHA`. A new merge commit on `main` will not satisfy the gate unless that
new SHA has also been deployed successfully to staging.

## 5. Product acceptance checklist

Record these items in the release PR, issue, or deployment note before
approving production:

```text
Commit SHA:
Staging URL:
Scope:
Automated checks:
Manual checks:
Known risks:
Approved for production by:
Approval date:
```

Minimum manual checks:

- `/docs` loads through Cloudflare Access.
- The changed pages appear in navigation and search.
- Japanese N2 pages still search for representative Japanese and Chinese terms.
- Audio byte-range playback still works when listening material is affected.
- `X-Robots-Tag: noindex` is present on staging.
- Canonical and OG URLs point at `stg.t3s7.com` on staging.
- The production candidate commit SHA matches the staged SHA.

## 6. First live test

After runner and environments are configured:

```bash
git push origin HEAD:stg
```

Watch `Deploy Staging`. If it succeeds, promote the same SHA to `main` using a
fast-forward or equivalent no-new-SHA workflow.

If production is expected to deploy through a merge commit, deploy that merge
commit to staging first.

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Deploy Staging` stays queued | No online runner with label `fuma-lab` | Start the runner service and confirm labels in GitHub. |
| `https://stg.t3s7.com` does not open after deploy | Host tunnel is down or public hostname points to the wrong service | Check `systemctl status cloudflared --no-pager` and confirm Cloudflare routes `stg.t3s7.com` to `http://127.0.0.1:3001`. |
| Production fails at `require-staging` | Current SHA was not deployed successfully to staging | Promote the exact staged SHA or deploy the production candidate SHA to staging first. |
| Production waits for approval | Required reviewers are enabled | Product/release owner approves after staging acceptance. |
| Deploy job cannot reach Docker | Runner user lacks Docker access | Fix host permissions and rerun the job. |
| Production rejects config | `PRODUCTION_SITE_URL` missing or placeholder, or `ROBOTS_NOINDEX=1` | Correct the production Environment variables. |

## 8. References

- GitHub Docs: self-hosted runner setup:
  <https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners>
- GitHub Docs: environments for deployment:
  <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>
