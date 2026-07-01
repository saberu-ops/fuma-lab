import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const OFFICIAL_ORIGIN = 'https://www.fumadocs.dev';
const UPSTREAM_REPOSITORY = 'https://github.com/fuma-nama/fumadocs';
const UPSTREAM_BRANCH = 'main';
const OUTPUT_ROOT = path.resolve('content/docs/fumadocs');
const SNAPSHOT_PATH = path.resolve('third_party/fumadocs/snapshot.json');
const LICENSE_PATH = path.resolve('third_party/fumadocs/LICENSE');
const MAX_PAGE_BYTES = 1024 * 1024;

const pages = [
  {
    source: '/docs',
    fetch: '/docs/index',
    target: 'index.mdx',
    title: 'Quick Start',
    description: 'Getting Started with Fumadocs',
  },
  {
    source: '/docs/what-is-fumadocs',
    target: 'what-is-fumadocs.mdx',
    title: 'What is Fumadocs',
    description: 'Introducing Fumadocs, a docs framework that you can break.',
  },
  {
    source: '/docs/page-conventions',
    target: 'page-conventions.mdx',
    title: 'Page Slugs & Page Tree',
    description: 'A shared convention for organizing your documents',
  },
  {
    source: '/docs/markdown',
    target: 'markdown.mdx',
    title: 'Markdown',
    description: 'How to write documents',
  },
  {
    source: '/docs/navigation',
    target: 'navigation.mdx',
    title: 'Navigation',
    description: 'Configure navigation in your Fumadocs app.',
  },
  {
    source: '/docs/deploying',
    target: 'deploying/index.mdx',
    title: 'Deploying',
    description: 'Deploy your Fumadocs app',
  },
  {
    source: '/docs/deploying/static',
    target: 'deploying/static.mdx',
    title: 'Static Build',
    description: 'Output static website with Fumadocs.',
  },
  {
    source: '/docs/internationalization',
    target: 'internationalization/index.mdx',
    title: 'Internationalization',
    description: 'Support multiple languages in your documentation',
  },
  {
    source: '/docs/internationalization/next',
    target: 'internationalization/next.mdx',
    title: 'Next.js Internationalization',
    description: 'Support i18n routing on your Next.js and Fumadocs app',
  },
  {
    source: '/docs/search',
    target: 'search/index.mdx',
    title: 'Search',
    description: 'Implement document search in your docs',
  },
  {
    source: '/docs/search/orama',
    target: 'search/orama.mdx',
    title: 'Orama Search',
    description: 'The default search engine powered by Orama.',
  },
  {
    source: '/docs/guides/access-control',
    target: 'guides/access-control.mdx',
    title: 'Access Control',
    description: 'Limit the access of content.',
  },
  {
    source: '/docs/guides/customize-ui',
    target: 'guides/customize-ui.mdx',
    title: 'Customize UI',
    description: 'A complete guide on how to customize Fumadocs UI.',
  },
  {
    source: '/docs/integrations/llms',
    target: 'integrations/llms.mdx',
    title: 'AI & LLMs',
    description: 'Integrate AI functionality to Fumadocs.',
  },
  {
    source: '/docs/ui',
    target: 'ui/index.mdx',
    title: 'Fumadocs UI',
    description: 'The default theme of Fumadocs',
  },
  {
    source: '/docs/ui/search',
    target: 'ui/search.mdx',
    title: 'Search UI',
    description: 'The UI for document search',
  },
  {
    source: '/docs/ui/translations',
    target: 'ui/translations.mdx',
    title: 'Translations',
    description: 'Adding Translations to UI',
  },
  {
    source: '/docs/ui/layouts',
    target: 'ui/layouts/index.mdx',
    title: 'Layouts',
    description: 'A list of layout components.',
  },
  {
    source: '/docs/ui/layouts/docs',
    target: 'ui/layouts/docs.mdx',
    title: 'Docs Layout',
    description: 'The layout of documentation',
  },
  {
    source: '/docs/ui/layouts/root-provider',
    target: 'ui/layouts/root-provider.mdx',
    title: 'Root Provider',
    description: 'The context provider of Fumadocs UI.',
  },
  {
    source: '/docs/mdx',
    target: 'mdx/index.mdx',
    title: 'Fumadocs MDX',
    description: 'Introducing Fumadocs MDX, the official content source.',
  },
  {
    source: '/docs/mdx/next',
    target: 'mdx/next.mdx',
    title: 'Fumadocs MDX with Next.js',
    description: 'Use Fumadocs MDX with Next.js',
  },
  {
    source: '/docs/mdx/collections',
    target: 'mdx/collections.mdx',
    title: 'Collections',
    description: 'Collection of content data for your app',
  },
];

const localRoutes = new Map(
  pages.map((page) => [normalizeRoute(page.source), targetToPublicUrl(page.target)]),
);

function normalizeRoute(value) {
  if (value === '/') return value;
  return value.replace(/\/+$/, '');
}

function targetToPublicUrl(target) {
  const withoutExtension = target.replace(/\.mdx$/, '');
  const slug = withoutExtension === 'index' ? '' : withoutExtension.replace(/\/index$/, '');
  return slug.length === 0 ? '/docs/fumadocs' : `/docs/fumadocs/${slug}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rewriteDestination(value) {
  if (!value.startsWith('/')) return value;

  const url = new URL(value, OFFICIAL_ORIGIN);
  const local = localRoutes.get(normalizeRoute(url.pathname));
  if (local) return `${local}${url.search}${url.hash}`;

  return url.href;
}

function makePortable(markdown) {
  let fence;
  let skippedComponent;
  const unsupportedComponents = new Set([
    'Customization',
    'DocsCategory',
    'Installation',
    'TypeTable',
  ]);
  const unsupportedIcons = new Set([
    'Building',
    'CpuIcon',
    'DatabaseIcon',
    'HomeIcon',
    'LinkIcon',
    'PanelLeftDashed',
    'PanelsTopLeftIcon',
    'Rocket',
    'TerminalIcon',
  ]);

  return markdown
    .split('\n')
    .flatMap((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (marker) {
        if (!fence) fence = marker[0];
        else if (marker[0] === fence) fence = undefined;
        return [line];
      }
      if (fence) return [line];

      if (skippedComponent) {
        if (line.includes('/>')) skippedComponent = undefined;
        return [];
      }

      const component = line.match(/^\s*<([A-Z][A-Za-z0-9]*)\b/)?.[1];
      if (component && unsupportedComponents.has(component)) {
        if (!line.includes('/>')) skippedComponent = component;
        return [];
      }
      if (component && unsupportedIcons.has(component) && line.trimEnd().endsWith('/>')) {
        return [];
      }
      if (/<img\b[^>]*\bsrc="__img\d+"[^>]*\/>/.test(line)) return [];

      const portable = line
        .replace(/\s+icon=\{<[A-Z][A-Za-z0-9]*\b[^>]*\/>\}/g, '')
        .replace(/\s+icon="<[^"]*\/>"/g, '')
        .replace(/<Tabs items="([^"]+)">/g, (_match, items) => {
          const expression = items
            .replaceAll('&#x22;', '"')
            .replaceAll('&quot;', '"')
            .replaceAll('&#x27;', "'")
            .replaceAll('&#39;', "'");
          return `<Tabs items={${expression}}>`;
        })
        .replace(/(\]\()((?:\/)[^)\s]+)(?=[\s)])/g, (_match, prefix, destination) => {
          return `${prefix}${rewriteDestination(destination)}`;
        })
        .replace(
          /((?:href|src)=["'])((?:\/)[^"']+)(["'])/g,
          (_match, prefix, destination, suffix) => {
            return `${prefix}${rewriteDestination(destination)}${suffix}`;
          },
        )
        .replace(
          /^(\s*\[[^\]]+\]:\s*)((?:\/)\S+)/,
          (_match, prefix, destination) => `${prefix}${rewriteDestination(destination)}`,
        );
      return [portable];
    })
    .join('\n');
}

function parseMarkdown(raw, page, fetchedAt) {
  const normalized = raw.replace(/\r\n?/g, '\n').trim();
  if (normalized.startsWith('<!DOCTYPE') || normalized.startsWith('<html')) {
    throw new Error(`${page.source}: expected Markdown, received HTML`);
  }
  if (Buffer.byteLength(normalized) > MAX_PAGE_BYTES) {
    throw new Error(`${page.source}: response exceeds ${MAX_PAGE_BYTES} bytes`);
  }

  const lines = normalized.split('\n');
  const urlIndex = lines.findIndex((line) => line.startsWith('URL: '));
  const sourceIndex = lines.findIndex((line) => line.startsWith('Source: '));
  if (urlIndex < 0 || sourceIndex < 0 || sourceIndex < urlIndex) {
    throw new Error(`${page.source}: missing upstream URL or source header`);
  }

  const reportedRoute = lines[urlIndex].slice('URL: '.length).trim();
  if (normalizeRoute(reportedRoute) !== normalizeRoute(page.source)) {
    throw new Error(`${page.source}: upstream reported unexpected route ${reportedRoute}`);
  }

  const sourceUrl = lines[sourceIndex].slice('Source: '.length).trim();
  const parsedSource = new URL(sourceUrl);
  if (parsedSource.protocol !== 'https:' || parsedSource.hostname !== 'raw.githubusercontent.com') {
    throw new Error(`${page.source}: unexpected source URL ${sourceUrl}`);
  }

  const body = makePortable(lines.slice(sourceIndex + 1).join('\n').trim())
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
  if (body.length === 0) throw new Error(`${page.source}: empty document body`);

  const officialUrl = new URL(page.source, OFFICIAL_ORIGIN).href;
  const snapshotDate = fetchedAt.slice(0, 10);
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(page.title)}`,
    `description: ${JSON.stringify(page.description)}`,
    '---',
  ].join('\n');
  const attribution = [
    `> 本页是 Fumadocs 官方文档的英文快照，获取于 ${snapshotDate}。`,
    `> [查看官网](${officialUrl}) · [查看源文件](${sourceUrl})`,
  ].join('\n');

  return {
    content: `${frontmatter}\n\n${attribution}\n\n${body}\n`,
    officialUrl,
    sourceUrl,
  };
}

async function fetchPage(page, fetchedAt) {
  const url = new URL(page.fetch ?? page.source, OFFICIAL_ORIGIN);
  const response = await fetch(url, {
    headers: {
      Accept: 'text/markdown',
      'User-Agent': 'fumadocs-personal-reference-sync/1.0',
    },
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`${page.source}: HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/markdown') && !contentType.includes('text/plain')) {
    throw new Error(`${page.source}: unexpected content type ${contentType}`);
  }

  return parseMarkdown(await response.text(), page, fetchedAt);
}

async function discoverUpstreamCommit() {
  const response = await fetch(
    `https://api.github.com/repos/fuma-nama/fumadocs/commits/${UPSTREAM_BRANCH}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'fumadocs-personal-reference-sync/1.0',
      },
    },
  );
  if (!response.ok) return null;

  const body = await response.json();
  return typeof body.sha === 'string' ? body.sha : null;
}

async function writeAtomically(filename, content) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, filename);
}

async function synchronize() {
  const fetchedAt = new Date().toISOString();
  const results = [];

  for (const page of pages) {
    process.stdout.write(`Fetching ${page.source}\n`);
    results.push({ page, ...(await fetchPage(page, fetchedAt)) });
  }

  const upstreamCommit = await discoverUpstreamCommit();
  const files = [];

  for (const result of results) {
    const filename = path.join(OUTPUT_ROOT, result.page.target);
    await writeAtomically(filename, result.content);
    files.push({
      sourceRoute: result.page.source,
      officialUrl: result.officialUrl,
      sourceUrl: result.sourceUrl,
      target: path.posix.join('content/docs/fumadocs', result.page.target),
      publicUrl: targetToPublicUrl(result.page.target),
      sha256: sha256(result.content),
    });
  }

  const snapshot = {
    schemaVersion: 1,
    fetchedAt,
    upstreamRepository: UPSTREAM_REPOSITORY,
    upstreamBranch: UPSTREAM_BRANCH,
    upstreamCommit,
    license: 'MIT',
    files,
  };
  await writeAtomically(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

  process.stdout.write(`Synchronized ${files.length} pages.\n`);
}

async function checkSnapshot() {
  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
  const expectedFiles = new Map(
    pages.map((page) => {
      const target = path.posix.join('content/docs/fumadocs', page.target);
      return [
        target,
        {
          sourceRoute: page.source,
          publicUrl: targetToPublicUrl(page.target),
        },
      ];
    }),
  );

  if (!Array.isArray(snapshot.files) || snapshot.files.length !== pages.length) {
    throw new Error(`snapshot must contain exactly ${pages.length} files`);
  }
  if ((await readFile(LICENSE_PATH, 'utf8')).includes('MIT License') === false) {
    throw new Error('upstream MIT license is missing or invalid');
  }

  for (const file of snapshot.files) {
    const expected = expectedFiles.get(file.target);
    if (!expected) {
      throw new Error(`unexpected snapshot target: ${file.target}`);
    }
    expectedFiles.delete(file.target);
    if (file.sourceRoute !== expected.sourceRoute || file.publicUrl !== expected.publicUrl) {
      throw new Error(`snapshot route mismatch: ${file.target}`);
    }

    const content = await readFile(path.resolve(file.target), 'utf8');
    if (sha256(content) !== file.sha256) {
      throw new Error(`snapshot hash mismatch: ${file.target}`);
    }
    if (!content.includes(`[查看官网](${file.officialUrl})`)) {
      throw new Error(`snapshot attribution missing: ${file.target}`);
    }
    if (
      /src="__img\d+"/.test(content) ||
      /<(TypeTable|Customization|DocsCategory|Installation)\b/.test(content)
    ) {
      throw new Error(`unsupported upstream component remains: ${file.target}`);
    }
  }
  if (expectedFiles.size > 0) {
    throw new Error(`snapshot is missing: ${[...expectedFiles.keys()].join(', ')}`);
  }

  process.stdout.write(`Verified ${snapshot.files.length} snapshot pages.\n`);
}

if (process.argv.includes('--check')) await checkSnapshot();
else await synchronize();
