import { Suspense } from 'react';
import { VoiceAgentSettingsForm } from '@/components/voice-agent/settings-form';
import { PersonaCards } from '@/components/voice-agent/persona-cards';

export const metadata = { title: 'Voice Agent Settings — Excess CRM' };

export default function VoiceAgentSettingsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Voice Agent Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure AI calling behaviour and persona settings.</p>
      </div>

      <Suspense fallback={<div className="grid grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-white rounded-xl animate-pulse" />)}</div>}>
        <PersonaCards />
      </Suspense>

      <Suspense fallback={<div className="h-64 bg-white rounded-xl animate-pulse" />}>
        <VoiceAgentSettingsForm />
      </Suspense>
    </div>
  );
}
