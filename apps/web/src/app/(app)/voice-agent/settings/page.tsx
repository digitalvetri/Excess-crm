import { Suspense } from 'react';
import { VoiceAgentSettingsForm } from '@/components/voice-agent/settings-form';

export const metadata = { title: 'Voice Agent Settings — Excess CRM' };

export default function VoiceAgentSettingsPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Calling Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          AI dial toggle, daily call cap, business hours, and retry cadence.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 bg-white rounded-xl animate-pulse" />}>
        <VoiceAgentSettingsForm />
      </Suspense>
    </div>
  );
}
