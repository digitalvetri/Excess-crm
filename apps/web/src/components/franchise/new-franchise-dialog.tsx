'use client';

import { useState } from 'react';
import { X, Building2 } from 'lucide-react';
import { useCreateFranchise } from '@/hooks/use-franchise';

interface NewFranchiseDialogProps {
  onClose: () => void;
}

export function NewFranchiseDialog({ onClose }: NewFranchiseDialogProps) {
  const create = useCreateFranchise();
  const [form, setForm] = useState({
    name: '',
    tier: '' as '' | 'BRONZE' | 'SILVER' | 'GOLD',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    gstNumber: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, tier, contactName, contactEmail, contactPhone, gstNumber } = form;
    create.mutate(
      {
        name,
        ...(tier && { tier }),
        ...(contactName && { contactName }),
        ...(contactEmail && { contactEmail }),
        ...(contactPhone && { contactPhone }),
        ...(gstNumber && { gstNumber }),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <h2 className="text-base font-semibold text-slate-800">New Franchise Partner</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Business Name <span className="text-danger">*</span>
            </label>
            <input
              required
              minLength={2}
              maxLength={200}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Coimbatore Solar Solutions"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tier</label>
            <select
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as '' | 'BRONZE' | 'SILVER' | 'GOLD' }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select tier (optional)</option>
              <option value="BRONZE">Bronze</option>
              <option value="SILVER">Silver</option>
              <option value="GOLD">Gold</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Name</label>
              <input
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Name"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Contact Email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              placeholder="partner@example.com"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">GST Number</label>
            <input
              value={form.gstNumber}
              onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value.toUpperCase() }))}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {create.isError && (
            <p className="text-xs text-danger">Failed to create franchise. Please try again.</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border text-sm font-medium text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending || !form.name}
              className="flex-1 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {create.isPending ? 'Creating…' : 'Create Franchise'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
