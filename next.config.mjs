import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  reactStrictMode: true,
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
