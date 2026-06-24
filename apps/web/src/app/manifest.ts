import type { MetadataRoute } from 'next';

// Makes the CRM installable ("Add to Home Screen" / desktop install). Next auto-
// serves this at /manifest.webmanifest and links it. Paired with a service worker
// (public/sw.js) registered from the root layout for fast repeat loads.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Excess CRM',
    short_name: 'Excess',
    description: 'Excess Renew Tech — solar CRM, from first call to commissioned rooftop.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0B7A3D',
    theme_color: '#0B7A3D',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
