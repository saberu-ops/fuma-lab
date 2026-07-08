import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  reactStrictMode: true,
  // Non-production environments (e.g. staging) build with ROBOTS_NOINDEX=1 so
  // every response carries X-Robots-Tag: noindex, keeping the staging domain out
  // of search indexes. Production leaves the flag unset and emits no such header.
  async headers() {
    if (process.env.ROBOTS_NOINDEX !== '1') return [];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source:
          '/docs/japanese-n2/listening-to-speaking/2024-july-listening-exam',
        destination: '/docs/japanese-n2/past-exams/2024-07/listening',
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
