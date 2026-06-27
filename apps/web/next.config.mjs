/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  transpilePackages: ['@excess/shared', '@excess/ui', '@excess/config'],
  // Next 15's built-in build-memory reducer — trades a little build speed for a much lower
  // peak, so the production build doesn't OOM on a constrained server (it's the heaviest of
  // the three parallel service builds). Paired with a NODE_OPTIONS heap ceiling in the Dockerfile.
  experimental: { webpackMemoryOptimizations: true },
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
  },
  // /api/v1/* is proxied by apps/web/src/app/api/v1/[...path]/route.ts at runtime.
  // That route handler reads INTERNAL_API_URL from the environment when the server starts.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control',  value: 'on' },
          { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          // microphone=(self): the voice-agent playground needs getUserMedia for live calls.
          // An empty allowlist (microphone=()) disables the mic for the whole app — even with
          // browser permission granted — so it must allow same-origin. Camera/geolocation stay off.
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
