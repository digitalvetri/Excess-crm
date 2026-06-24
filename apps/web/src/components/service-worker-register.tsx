'use client';

import { useEffect } from 'react';

// Registers the service worker (public/sw.js) in production for fast repeat loads.
// No-ops in dev and on unsupported browsers.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration is best-effort; ignore failures */
    });
  }, []);
  return null;
}
