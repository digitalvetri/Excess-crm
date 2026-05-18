'use client';

import { useState } from 'react';
import { Users, ChevronRight, UserPlus, Trash2 } from 'lucide-react';
import { useTeams, useTeam, useUsers, useAddTeamMember, useRemoveTeamMember } from '@/hooks/use-teams';

export function TeamsList() {
  const { data: teams, isLoading } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-border animate-pulse" />
        ))}
      </div>
    );
  }

  const teamList = teams ?? [];

  if (teamList.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-12 text-center">
        <Users className="mx-auto mb-3 text-slate-300" size={32} />
        <p className="text-slate-500 text-sm">No teams yet. Create a team to start routing leads.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        {teamList.map((team) => (
          <button
            key={team.id}
            onClick={() => setSelectedTeamId(team.id === selectedTeamId ? null : team.id)}
            className={`w-full text-left bg-white rounded-xl border p-5 hover:border-primary/40 transition-colors ${team.id === selectedTeamId ? 'border-primary' : 'border-border'}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{team.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {team._count.members} members · {team._count.leads} leads
                </p>
              </div>
              <ChevronRight size={16} className={`text-slate-400 transition-transform ${team.id === selectedTeamId ? 'rotate-90' : ''}`} />
            </div>
          </button>
        ))}
      </div>

      {selectedTeamId && (
        <TeamDetail teamId={selectedTeamId} />
      )}
    </div>
  );
}

function TeamDetail({ teamId }: { teamId: string }) {
  const { data: team, isLoading } = useTeam(teamId);
  const { data: allUsers } = useUsers();
  const addMember = useAddTeamMember(teamId);
  const removeMember = useRemoveTeamMember(teamId);

  if (isLoading) return <div className="h-48 bg-white rounded-xl border border-border animate-pulse" />;
  if (!team) return null;

  const memberIds = new Set(team.members.map((m) => m.id));
  const availableUsers = (allUsers ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{team.name}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{team.members.length} members</p>
      </div>

      {/* Members list */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Members</p>
        {team.members.length === 0 ? (
          <p className="text-xs text-slate-400">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {team.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-sm text-slate-800">{member.name}</p>
                  <p className="text-xs text-slate-400">{member.role} · {member.email}</p>
                </div>
                <button
                  onClick={() => removeMember.mutate(member.id)}
                  disabled={removeMember.isPending}
                  className="p-1.5 text-slate-400 hover:text-danger transition-colors disabled:opacity-50"
                  title="Remove from team"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add member */}
      {availableUsers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Add Member</p>
          <div className="flex gap-2">
            <select
              id={`add-member-${teamId}`}
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select user…</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <button
              onClick={() => {
                const sel = document.getElementById(`add-member-${teamId}`) as HTMLSelectElement | null;
                if (sel?.value) addMember.mutate(sel.value);
              }}
              disabled={addMember.isPending}
              className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              <UserPlus size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Routing rules */}
      {team.routingRules.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Routing Rules</p>
          <div className="space-y-1.5">
            {team.routingRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between text-xs py-1">
                <span className="text-slate-600">Priority {rule.priority}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${rule.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {rule.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
