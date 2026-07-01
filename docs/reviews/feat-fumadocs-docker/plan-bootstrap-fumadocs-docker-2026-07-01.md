# Plan: Bootstrap Fumadocs Docker Deployment

## Purpose

Create a minimal, reproducible Fumadocs application for personal use, packaged
as a hardened Docker service and based on the current Node.js 24 LTS line.

## Cost and Level

- Estimate: medium, approximately one implementation round.
- Level: architecture, because this establishes a new application, runtime
  boundary, deployment interface, and operational defaults.
- Review focus: container boundary, exposed network surface, persistence,
  update path, health signalling, and secret handling.

## 0. Best-Practice Pre-check

Sources reviewed:

- Fumadocs Quick Start:
  <https://www.fumadocs.dev/docs>
- Fumadocs deployment guidance:
  <https://www.fumadocs.dev/docs/deploying>
- Fumadocs static build guidance:
  <https://www.fumadocs.dev/docs/deploying/static>
- Node.js release status:
  <https://nodejs.org/en/about/previous-releases>
- Next.js Docker example:
  <https://github.com/vercel/next.js/tree/canary/examples/with-docker>

Conclusion:

- Use the official Fumadocs generator instead of assembling package versions by
  hand.
- Use Next.js standalone output because it preserves a path to authentication
  and server-side integrations without changing the deployment model.
- Use Node.js 24 for both build and runtime stages. Fumadocs documents Node.js
  22 as the minimum, while its current development branch requires Node.js
  24.14 or newer.
- Compile MDX into the immutable image. Do not mount source content into the
  runtime container because content changes require a rebuild.

## Scope

1. Scaffold the current Fumadocs Next.js template with Fumadocs MDX.
2. Pin the project runtime expectation to Node.js 24 LTS.
3. Configure Next.js standalone output.
4. Add a multi-stage, non-root Docker image.
5. Add a Compose service with localhost-only publishing, read-only runtime,
   dropped capabilities, bounded logs, and a health check.
6. Add Docker ignore rules and concise local/deployment instructions.
7. Include a small Chinese documentation page to verify the content path.

## Out of Scope

- Authentication and authorization.
- TLS termination and reverse-proxy configuration.
- AI provider integration.
- CMS or browser-based editing.
- Production domain, DNS, monitoring, and automated deployment.
- Mandarin-specific search tuning beyond the generated default.

## Current-State Gap Analysis

| Area | Current state | Target state |
| --- | --- | --- |
| Application | No project files | Generated Fumadocs application |
| Runtime | Undeclared | Node.js 24 LTS |
| Packaging | None | Reproducible multi-stage Docker image |
| Exposure | None | Port 3000 bound to host loopback only |
| Persistence | None | Immutable content; no runtime volume |
| Operations | None | Compose lifecycle and health check documented |
| Verification | None | Build, static checks, container config, smoke test |

## Per-Change Rationale

- Exact application dependencies will come from the generator and lockfile,
  reducing version-combination errors.
- The same Node major in builder and runner avoids runtime ABI differences.
- A non-root, read-only runtime with no Linux capabilities limits container
  impact without changing application behaviour.
- Loopback-only port publishing prevents accidental direct Internet exposure;
  a reverse proxy can be added later.
- Bounded Docker logs avoid unplanned disk growth.
- No content volume keeps runtime state disposable and makes Git plus the image
  the source of truth.

## Phased Roadmap

### Phase 1: Application Baseline

- Run the official generator in the current directory.
- Review generated files and package versions.
- Add the Chinese smoke-test content.

### Phase 2: Containerization

- Enable standalone output.
- Add `Dockerfile`, `.dockerignore`, and `compose.yaml`.
- Add runtime version declarations and operating instructions.

### Phase 3: Verification and Record

- Confirm the diff matches this plan.
- Run formatting, lint/type checks, and production build.
- Validate the Compose model.
- Build and smoke-test the container when a Docker daemon is available.
- Record results and explicit omissions in the round changelog.

## Acceptance Criteria

- The site builds successfully under Node.js 24.
- The generated site renders at least one Chinese document.
- `docker compose config` succeeds.
- The image builds successfully.
- The service runs as a non-root user and reports healthy.
- The host-facing application port binds only to `127.0.0.1`.
- No credentials or host-specific paths are committed.
- A changelog records all files, checks, and deferred decisions.
