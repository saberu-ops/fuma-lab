import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const interactive = page.data.interactive;

  return (
    <DocsPage
      breadcrumb={{ enabled: !interactive }}
      className={
        interactive
          ? 'lg:h-[calc(var(--fd-docs-height)-var(--fd-docs-row-3))] lg:min-h-0 lg:max-w-none lg:gap-3 lg:overflow-hidden lg:py-4 xl:py-4'
          : undefined
      }
      footer={{
        enabled: true,
        className: interactive
          ? 'shrink-0 gap-3 [&_a]:gap-1 [&_a]:p-3'
          : undefined,
      }}
      toc={page.data.toc}
      full={page.data.full}
    >
      <DocsTitle className={interactive ? 'shrink-0' : undefined}>
        {page.data.title}
      </DocsTitle>
      {!interactive && (
        <>
          <DocsDescription className="mb-0">
            {page.data.description}
          </DocsDescription>
          <div className="flex flex-row items-center gap-2 border-b pb-6">
            <MarkdownCopyButton markdownUrl={markdownUrl} />
            <ViewOptionsPopover markdownUrl={markdownUrl} />
          </div>
        </>
      )}
      <DocsBody
        className={interactive ? 'lg:min-h-0 lg:overflow-hidden' : undefined}
      >
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: getPageImage(page).url,
    },
  };
}
