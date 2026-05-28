import { VoiceAgentTesting } from '@/components/voice-agent/voice-agent-testing';

export const metadata = { title: 'Voice Agent Monitor — Excess CRM' };

export default function VoiceMonitorPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Monitor</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live queue health, test dials, and recent call transcripts.
        </p>
      </div>
      <VoiceAgentTesting />
    </div>
  );
}
