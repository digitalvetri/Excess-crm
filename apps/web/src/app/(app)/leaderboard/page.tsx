'use client';

import { useLeaderboard, AgentStat, FranchiseStat } from '@/hooks/use-leaderboard';

const MEDALS = ['🥇', '🥈', '🥉'];

function AgentRow({ stat, rank, maxLeads }: { stat: AgentStat; rank: number; maxLeads: number }) {
  const pct = maxLeads > 0 ? Math.round((stat.convertedLeads / maxLeads) * 100) : 0;
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 px-4 text-sm w-10 text-center">
        {rank <= 3 ? MEDALS[rank - 1] : <span className="text-slate-500">{rank}</span>}
      </td>
      <td className="py-3 px-4 text-sm font-medium text-slate-800">{stat.name}</td>
      <td className="py-3 px-4 text-sm text-slate-600 w-40">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums w-6 text-right">{stat.convertedLeads}</span>
        </div>
      </td>
    </tr>
  );
}

function FranchiseRow({
  stat,
  rank,
  maxCommission,
}: {
  stat: FranchiseStat;
  rank: number;
  maxCommission: number;
}) {
  const val = parseFloat(stat.commissionInr) || 0;
  const pct = maxCommission > 0 ? Math.round((val / maxCommission) * 100) : 0;
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 px-4 text-sm w-10 text-center">
        {rank <= 3 ? MEDALS[rank - 1] : <span className="text-slate-500">{rank}</span>}
      </td>
      <td className="py-3 px-4 text-sm font-medium text-slate-800">{stat.name}</td>
      <td className="py-3 px-4 text-sm text-slate-600 w-48">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums text-right">
            ₹{val.toLocaleString('en-IN')}
          </span>
        </div>
      </td>
    </tr>
  );
}

export default function LeaderboardPage() {
  const { data, loading, error } = useLeaderboard();

  const currentMonth = data?.monthStart
    ? new Date(data.monthStart).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const maxLeads =
    data?.agents?.length ? Math.max(...data.agents.map((a) => a.convertedLeads)) : 0;
  const maxCommission =
    data?.franchises?.length
      ? Math.max(...data.franchises.map((f) => parseFloat(f.commissionInr) || 0))
      : 0;

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Leaderboard</h1>
        <p className="text-sm text-slate-500 mb-6">{currentMonth}</p>
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Leaderboard</h1>
        <p className="text-sm text-slate-500 mb-6">{currentMonth}</p>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Leaderboard</h1>
      <p className="text-sm text-slate-500 mb-6">{currentMonth}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Top Agents</h2>
          </div>
          {!data?.agents?.length ? (
            <p className="px-4 py-6 text-sm text-slate-400">No data for this month</p>
          ) : (
            <table className="w-full">
              <tbody>
                {data.agents.map((stat, i) => (
                  <AgentRow
                    key={stat.userId}
                    stat={stat}
                    rank={i + 1}
                    maxLeads={maxLeads}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Franchises */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Top Franchises</h2>
          </div>
          {!data?.franchises?.length ? (
            <p className="px-4 py-6 text-sm text-slate-400">No data for this month</p>
          ) : (
            <table className="w-full">
              <tbody>
                {data.franchises.map((stat, i) => (
                  <FranchiseRow
                    key={stat.tenantId}
                    stat={stat}
                    rank={i + 1}
                    maxCommission={maxCommission}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
