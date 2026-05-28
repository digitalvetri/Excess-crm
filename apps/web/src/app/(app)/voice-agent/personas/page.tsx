import { PersonaManager } from '@/components/voice-agent/persona-manager';

export const metadata = { title: 'Voice Personas — Excess CRM' };

export default function VoicePersonasPage() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Voice Personas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure each AI agent&apos;s script, voice, and call behaviour.
        </p>
      </div>
      <PersonaManager />
    </div>
  );
}
