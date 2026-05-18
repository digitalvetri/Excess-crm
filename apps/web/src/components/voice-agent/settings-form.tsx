'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const settingsSchema = z.object({
  dailyCallCap: z.number().int().min(1).max(10000),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
  maxRetriesPerLead: z.number().int().min(1).max(10),
  aiDialEnabled: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface Settings {
  dailyCallCap: number;
  businessHoursStart: string;
  businessHoursEnd: string;
  timezone: string;
  maxRetriesPerLead: number;
  aiDialEnabled: boolean;
}

const DEFAULT_SETTINGS: SettingsForm = {
  dailyCallCap: 2000,
  businessHoursStart: '09:00',
  businessHoursEnd: '21:00',
  timezone: 'Asia/Kolkata',
  maxRetriesPerLead: 5,
  aiDialEnabled: true,
};

export function VoiceAgentSettingsForm() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['voice-agent-settings'],
    queryFn: () => api.get<{ data: Settings }>('/voice-agent/settings').then((r) => r.data.data),
  });

  const { register, handleSubmit, formState: { errors, isDirty, isSubmitting } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    values: data ?? DEFAULT_SETTINGS,
  });

  const mutation = useMutation({
    mutationFn: (values: SettingsForm) =>
      api.put<{ data: Settings }>('/voice-agent/settings', values).then((r) => r.data.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['voice-agent-settings'], updated);
    },
  });

  if (isLoading) {
    return <div className="h-64 bg-white rounded-xl animate-pulse" />;
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-5">Calling Configuration</h2>

      <form onSubmit={handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-5">
        {/* AI Dial toggle */}
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-700">AI Dialling</p>
            <p className="text-xs text-slate-500">Enable automated AI calling for new leads</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" {...register('aiDialEnabled')} className="sr-only peer" />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>

        {/* Daily cap */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Daily Call Cap</label>
          <input
            type="number"
            {...register('dailyCallCap', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {errors.dailyCallCap && <p className="text-xs text-danger mt-1">{errors.dailyCallCap.message}</p>}
        </div>

        {/* Business hours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Hours Start</label>
            <input
              type="time"
              {...register('businessHoursStart')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Hours End</label>
            <input
              type="time"
              {...register('businessHoursEnd')}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
          <select
            {...register('timezone')}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        {/* Max retries */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Max Retries per Lead</label>
          <input
            type="number"
            min={1}
            max={10}
            {...register('maxRetriesPerLead', { valueAsNumber: true })}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {errors.maxRetriesPerLead && <p className="text-xs text-danger mt-1">{errors.maxRetriesPerLead.message}</p>}
        </div>

        {mutation.isError && (
          <p className="text-sm text-danger">Failed to save settings. Please try again.</p>
        )}

        {mutation.isSuccess && (
          <p className="text-sm text-success">Settings saved successfully.</p>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={!isDirty || isSubmitting || mutation.isPending}
            className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
