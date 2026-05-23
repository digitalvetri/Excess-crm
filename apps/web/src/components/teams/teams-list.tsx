'use client';

import { useState } from 'react';
import { Users, ChevronRight, UserPlus, Trash2, Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTeams, useTeam, useUsers, useAddTeamMember, useRemoveTeamMember, useCreateTeam } from '@/hooks/use-teams';

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const create = useCreateTeam();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim() });
      toast.success(`Team "${name.trim()}" created`);
      onClose();
    } catch {
      toast.error('Failed to create team');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Create Team</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Team Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. North Zone Sales"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {create.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Create Team
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-border text-slate-600 text-sm rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TeamsList() {
  const { data: teams, isLoading } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
      <>
        {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
        <div className="bg-white rounded-xl border border-border p-12 sm:p-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Users className="text-slate-400" size={28} />
          </div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">No teams yet</h3>
          <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
            Create teams to group agents and set up automatic lead routing rules.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} /> Create First Team
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
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
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-primary hover:text-primary transition-colors"
          >
            <Plus size={14} /> Create Team
          </button>
        </div>

        {selectedTeamId && (
          <TeamDetail teamId={selectedTeamId} />
        )}
      </div>
    </>
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

      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Members</p>
        {team.members.length === 0 ? (
          <p className="text-xs text-slate-400">No members yet. Add users below.</p>
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
