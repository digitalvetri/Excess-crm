import { VoicePlayground } from '@/components/voice-agent/voice-playground';

export const metadata = { title: 'Voice Agent Playground — Excess CRM' };

export default function VoicePlaygroundPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Agent Playground</h1>
        <p className="text-sm text-slate-500 mt-1">
          Test conversations with any persona — no outbound calls. Tool actions are simulated locally.
        </p>
      </div>
      <VoicePlayground />
    </div>
  );
}
