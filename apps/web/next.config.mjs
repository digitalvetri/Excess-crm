/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  transpilePackages: ['@excess/shared', '@excess/ui', '@excess/config'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
  // Proxy /api/v1/* to the Fastify API server at runtime.
  // INTERNAL_API_URL is set in Coolify env vars (no build-arg needed).
  // Falls back to localhost:8000 for local dev.
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:8000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
