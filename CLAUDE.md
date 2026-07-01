# Fumadocs Personal Documentation

## Background

This project hosts a personal documentation site built with Fumadocs and Next.js.
It is intended to run as an isolated Docker workload so the host only needs a
container runtime.

## Current State

- The Next.js and Fumadocs MDX application is scaffolded and builds on Node.js
  24 LTS.
- `Dockerfile` produces a non-root standalone image.
- `compose.yaml` runs the service with a read-only root filesystem and publishes
  port 3000 on the host loopback interface only.
- The page tree has `个人文档` and `Fumadocs 参考` roots. The second root contains
  an attributed 23-page English snapshot with a fixed allowlist and hash
  manifest under `third_party/fumadocs/`.
- Normal application build and runtime are offline with respect to upstream
  documentation. `npm run docs:sync` is the explicit networked refresh action.
- Implementation records are tracked under `docs/reviews/`.

## Open Decisions

- Public access versus an authenticated private deployment.
- Reverse proxy and TLS provider.
- Whether future content authoring remains Git/MDX-only or gains a CMS.
- Mandarin-specific search tokenization.
- Whether the mixed Chinese/English content should become fully routed i18n.

## Project Feedback

Record project-specific recurring corrections here when they are discovered.
