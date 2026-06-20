'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateManualProject } from '@/hooks/use-projects';
import { getApiErrorMessage } from '@/lib/api-error';

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone]               = useState('');
  const [city, setCity]                 = useState('');
  const [systemKw, setSystemKw]         = useState('');
  const [totalValue, setTotalValue]     = useState('');

  const createProject = useCreateManualProject();

  const canSubmit = customerName.trim().length > 0 && phone.trim().length >= 5;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    createProject.mutate(
      {
        customerName: customerName.trim(),
        phone: phone.trim(),
        ...(city.trim() && { city: city.trim() }),
        ...(systemKw && { systemKw: Number(systemKw) }),
        ...(totalValue && { totalValueInr: Number(totalValue) }),
      },
      {
        onSuccess: () => {
          toast.success('Project created');
          onClose();
        },
        onError: (err) => toast.error(getApiErrorMessage(err)),
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">New Install Project</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              For walk-in or phone deals that didn&apos;t come through a lead.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Customer name <span className="text-danger">*</span>
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Phone <span className="text-danger">*</span>
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              inputMode="tel"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Coimbatore"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">System size (kW)</label>
              <input
                value={systemKw}
                onChange={(e) => setSystemKw(e.target.value)}
                placeholder="5"
                type="number"
                min="0"
                step="0.1"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deal value (₹)</label>
              <input
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                placeholder="350000"
                type="number"
                min="0"
                step="1"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || createProject.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
