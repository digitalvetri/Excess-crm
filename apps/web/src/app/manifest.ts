import type { MetadataRoute } from 'next';

// Makes the CRM installable ("Add to Home Screen" / desktop install). Next auto-
// serves this at /manifest.webmanifest and links it. NOTE: for full install on
// Chrome, add dedicated 192/512 maskable PNG icons (logo.jpeg is a stop-gap) and a
// service worker for offline — tracked as a P1 follow-up.
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
      { src: '/logo.jpeg', sizes: '192x192', type: 'image/jpeg' },
      { src: '/logo.jpeg', sizes: '512x512', type: 'image/jpeg' },
    ],
  };
}
