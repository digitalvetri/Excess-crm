import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Excess CRM',
  description: 'Solar CRM with AI Voice Agent — Excess Renew Tech Pvt Ltd',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Excess', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0B7A3D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <Toaster position="top-right" richColors />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
