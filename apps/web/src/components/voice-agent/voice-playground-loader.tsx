'use client';

import dynamic from 'next/dynamic';

export const VoicePlayground = dynamic(
  () => import('./voice-playground').then((m) => m.VoicePlayground),
  { ssr: false },
);
