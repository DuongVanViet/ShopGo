const backend = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:3001');
if (!['http:', 'https:'].includes(backend.protocol)) throw new Error('Invalid BACKEND_URL');

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${backend.origin}/api/v1/:path*` }];
  },
};
export default config;
