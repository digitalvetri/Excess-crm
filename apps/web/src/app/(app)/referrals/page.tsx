'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useRewardReferral, Referral } from '@/hooks/use-referrals';

type StatusFilter = 'ALL' | 'PENDING' | 'CONVERTED' | 'REWARDED';

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Converted', value: 'CONVERTED' },
  { label: 'Rewarded', value: 'REWARDED' },
];

const STATUS_BADGE: Record<Referral['status'], string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONVERTED: 'bg-blue-100 text-blue-800',
  REWARDED: 'bg-green-100 text-green-800',
};

function RewardForm({
  referralId,
  onSuccess,
}: {
  referralId: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const { reward, loading, error } = useRewardReferral();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount.trim()) return;
    await reward(referralId, amount.trim());
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount ₹"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        type="submit"
        disabled={loading || !amount.trim()}
        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </form>
  );
}

export default function ReferralsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [tick, setTick] = useState(0);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);
  const [rewardingId, setRewardingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);

    const params = statusFilter !== 'ALL' ? { status: statusFilter } : {};

    api
      .get<{ data: Referral[] }>('/referrals', { params })
      .then((r) => {
        if (!cancelled) setReferrals(r.data.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setListError(err instanceof Error ? err.message : 'Failed to load referrals');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, tick]);

  async function handleMarkConverted(id: string) {
    setMarkingId(id);
    setMarkError(null);
    try {
      await api.patch(`/referrals/${id}`, { status: 'CONVERTED' });
      setTick((t) => t + 1);
    } catch (err: unknown) {
      setMarkError(err instanceof Error ? err.message : 'Failed to update referral');
    } finally {
      setMarkingId(null);
    }
  }

  function handleRewardSuccess() {
    setRewardingId(null);
    setTick((t) => t + 1);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Referrals</h1>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {STATUS_TABS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              statusFilter === value
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {markError && <p className="mb-4 text-sm text-red-500">{markError}</p>}

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : listError ? (
        <p className="text-red-500 text-sm">{listError}</p>
      ) : referrals.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-10 text-center">
          <p className="text-slate-400 text-sm">No referrals found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Lead Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Phone</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Reward</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((ref) => (
                <tr key={ref.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {ref.referredLead?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ref.referredLead?.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ref.status]}`}
                    >
                      {ref.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ref.rewardInr
                      ? `₹${parseFloat(ref.rewardInr).toLocaleString('en-IN')}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(ref.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    {ref.status === 'PENDING' && (
                      <button
                        onClick={() => handleMarkConverted(ref.id)}
                        disabled={markingId === ref.id}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {markingId === ref.id ? 'Updating…' : 'Mark Converted'}
                      </button>
                    )}
                    {ref.status === 'CONVERTED' && (
                      <>
                        {rewardingId === ref.id ? (
                          <RewardForm referralId={ref.id} onSuccess={handleRewardSuccess} />
                        ) : (
                          <button
                            onClick={() => setRewardingId(ref.id)}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Reward
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
