'use client';

import { useQuery } from '@tanstack/react-query';
import { Phone, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface PersonaConfig {
  id: string;
  personaId: string;
  version: number;
  isActive: boolean;
  activatedAt: string | null;
  systemPrompt: string;
}

const PERSONA_META: Record<string, { name: string; role: string; trigger: string }> = {
  RESHMA_VERIFY: {
    name: 'Reshma · Verify',
    role: 'Lead Verification',
    trigger: 'New lead arrives',
  },
  KARTHIK_SALES: {
    name: 'Karthik · Sales',
    role: 'Sales Conversion',
    trigger: 'Lead qualified → +30 min',
  },
  RESHMA_FOLLOWUP: {
    name: 'Reshma · Follow-up',
    role: 'Re-engagement',
    trigger: 'Scheduled follow-up time',
  },
};

const PERSONAS = ['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP'] as const;

export function PersonaCards() {
  const { data } = useQuery({
    queryKey: ['voice-agent-configs'],
    queryFn: () =>
      api.get<{ data: PersonaConfig[] }>('/voice-agent/configs').then((r) => r.data.data),
  });

  const configs = data ?? [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {PERSONAS.map((personaId) => {
        const meta = PERSONA_META[personaId] ?? { name: personaId, role: '', trigger: '' };
        const config = configs.find((c) => c.personaId === personaId && c.isActive);

        return (
          <div key={personaId} className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Phone size={16} className="text-primary" />
              </div>
              {config ? (
                <span className="flex items-center gap-1 text-xs text-success font-medium">
                  <CheckCircle size={12} /> Active
                </span>
              ) : (
                <span className="text-xs text-slate-400">Not configured</span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-800">{meta.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{meta.role}</p>
            <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">{meta.trigger}</p>
            {config && (
              <p className="text-xs text-slate-400 mt-1">v{config.version}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
