import { VoiceAbTesting } from '@/components/voice-agent/voice-ab-testing';

export const metadata = { title: 'Voice A/B Testing — Excess CRM' };

export default function VoiceAbTestingPage() {
  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">A/B Testing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Split traffic between prompt variants and compare conversion outcomes.
        </p>
      </div>
      <VoiceAbTesting />
    </div>
  );
}
