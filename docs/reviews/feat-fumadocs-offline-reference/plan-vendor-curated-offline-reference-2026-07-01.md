# Plan: Vendor a Curated Offline Fumadocs Reference

## Purpose

Add an attributed, locally searchable snapshot of the most useful official
Fumadocs documentation. Use it as realistic content for Fumadocs layout tabs
while keeping the personal documentation area independent.

## Approval Context

The user approved the proposed direction on 2026-07-01:

- Keep personal documents as one root area.
- Add a curated Fumadocs reference as another root area.
- Preserve the upstream license and snapshot provenance.
- Avoid importing the complete official documentation application and its
  specialized build dependencies.

## Cost and Level

- Estimate: medium.
- Level: architecture.
- Review focus: third-party content provenance, update trust boundary, route
  isolation, link integrity, offline behavior, and search/index growth.

## 0. Best-Practice Pre-check

Sources reviewed:

- Official documentation content:
  <https://github.com/fuma-nama/fumadocs/tree/dev/apps/docs/content/docs>
- Official MIT license:
  <https://github.com/fuma-nama/fumadocs/blob/dev/LICENSE>
- Official MDX build configuration:
  <https://github.com/fuma-nama/fumadocs/blob/dev/apps/docs/source.config.ts>
- Fumadocs Layout Tabs:
  <https://www.fumadocs.dev/docs/ui/layouts/docs>
- Fumadocs page tree root folders:
  <https://www.fumadocs.dev/docs/headless/page-conventions>
- Official `llms.txt` index:
  <https://www.fumadocs.dev/llms.txt>

Findings:

- The current official snapshot contains roughly 156 Markdown/MDX pages across
  Framework, UI, Core, MDX, CLI, OpenAPI, and AsyncAPI roots.
- The repository license permits copying and modifying the software and
  associated documentation when its copyright and permission notice are
  retained.
- Raw wholesale copying is unsuitable. The official site uses Twoslash, KaTeX,
  TypeScript Docgen, OpenAPI, AsyncAPI, custom components, and monorepo-local
  imports.
- The official site exposes portable processed Markdown through HTTP content
  negotiation with `Accept: text/markdown`. This output removes the need to
  reproduce the official MDX processing stack.
- Root folders with `root: true` generate the same Layout Tabs dropdown shown
  below search on the official site.

Conclusion:

- Vendor a small allowlisted processed-Markdown snapshot, not the raw website
  content tree.
- Keep the imported files committed locally so normal build and runtime do not
  need access to the official site.
- Make refresh an explicit maintainer action with provenance recording.

## Scope

### Navigation Structure

Create two page-tree roots:

1. `个人文档`: the current Chinese starter content.
2. `Fumadocs 参考`: the vendored English reference snapshot.

Use Fumadocs root folders so the standard Layout Tabs dropdown appears below
the search control without replacing the packaged layout component.

### Curated Reference Set

Import these 23 pages:

#### Framework

1. Quick Start
2. What is Fumadocs
3. Page Slugs & Page Tree
4. Markdown
5. Navigation
6. Deploying
7. Static Build
8. Internationalization
9. Next.js Internationalization
10. Search
11. Orama Search
12. Access Control
13. Customize UI
14. AI & LLMs

#### Fumadocs UI

15. UI Overview
16. Search UI
17. Translations
18. Layouts Overview
19. Docs Layout
20. Root Provider

#### Fumadocs MDX

21. MDX Getting Started
22. Next.js Integration
23. Collections

### Snapshot Tooling

Add a dependency-free Node.js synchronization script that:

- Uses a fixed allowlist of official routes and local destinations.
- Requests each route with `Accept: text/markdown`.
- Rejects non-HTTPS sources, non-success responses, unexpected content, empty
  bodies, and oversized responses.
- Converts the upstream heading and source header into local frontmatter and a
  visible attribution notice.
- Rewrites links to imported pages to local `/docs/fumadocs/...` routes.
- Rewrites links to non-imported official pages and assets to absolute official
  URLs so the local site does not generate broken internal links.
- Writes snapshot metadata containing source URL, fetch timestamp, upstream
  repository, upstream branch/commit when discoverable, and the imported route
  manifest.
- Produces deterministic output apart from explicit snapshot metadata.

### Licensing

- Add the upstream MIT license under `third_party/fumadocs/LICENSE`.
- Add a third-party notice with the Fumadocs author, repository, license,
  snapshot date, and modification statement.
- Show provenance on each imported page.

### Documentation

- Document the difference between personal content and the vendored snapshot.
- Document the manual refresh command and the need to review diffs before
  accepting refreshed third-party content.
- State that the snapshot can become stale and is not an automatic update
  channel.

## Out of Scope

- Copying all 156 official pages.
- Copying the official site application, visual branding, custom components,
  fonts, AI chat, OpenAPI, or AsyncAPI examples.
- Translating the upstream English documentation.
- Multi-language routing or a language switcher.
- Automatic scheduled refreshes or network access during application runtime.
- Treating the vendored snapshot as authoritative beyond its recorded date.
- Mandarin-specific Orama tokenization.

## Current-State Gap Analysis

| Area | Current state | Target state |
| --- | --- | --- |
| Page-tree roots | Single flat tree | Personal and Fumadocs reference roots |
| Layout dropdown | Hidden because no root is active | Standard Layout Tabs dropdown |
| Reference content | Two local starter pages | 23-page curated offline snapshot |
| Provenance | Not applicable | License, notice, route and snapshot metadata |
| Update path | None | Explicit allowlisted sync command |
| Runtime network | Not needed | Still not needed |
| Search | Two pages | Personal and imported pages in one local index |

## Per-Change Rationale

- Processed Markdown is more portable and safer than reproducing the upstream
  monorepo-specific MDX compiler.
- A fixed allowlist prevents an upstream navigation change from silently
  expanding the copied content set.
- Root folders use the framework's native dropdown behavior and retain package
  updates.
- Local copies meet the offline-reference goal and make content changes
  reviewable.
- Explicit attribution meets the MIT notice condition and distinguishes copied
  material from personal authorship.
- Externalizing non-imported links avoids false local coverage and broken
  routes.

## Phased Roadmap

### Phase 1: Root Navigation

- Move the existing pages into a route-neutral personal root folder.
- Add root metadata for personal and reference areas.
- Confirm existing personal URLs remain unchanged.

### Phase 2: Snapshot Pipeline

- Add the allowlisted synchronization script.
- Fetch and normalize the 23 selected pages.
- Add license, notice, and machine-readable snapshot metadata.
- Review generated content for unsupported MDX syntax and route collisions.

### Phase 3: Documentation and Verification

- Document update and provenance procedures.
- Run direction, lint, type, and production build gates.
- Build and start the Docker image.
- Verify the root dropdown, personal routes, imported routes, attribution,
  search results, `llms.txt`, non-root runtime, and localhost-only binding.
- Remove the test container and record the round changelog.

## Acceptance Criteria

- The sidebar displays a working dropdown below search with `个人文档` and
  `Fumadocs 参考`.
- Existing `/docs` and `/docs/test` routes still resolve.
- All 23 allowlisted reference pages build and render locally.
- Imported pages are available under `/docs/fumadocs/...`.
- Imported-page search works without contacting the official site.
- Internal links between imported pages resolve locally.
- Non-imported upstream links point to `https://www.fumadocs.dev`.
- The upstream MIT license and clear attribution are included.
- Snapshot metadata identifies the source and acquisition time.
- Normal application build and runtime do not fetch remote documentation.
- Lint, type check, production build, Docker build, health check, and smoke
  tests pass in the same final verification iteration.
