'use client';

import { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { useUsers } from '@/hooks/use-teams';
import { useAssignLead } from '@/hooks/use-leads';

interface AssignLeadPanelProps {
  leadId: string;
  currentOwnerId: string | null;
}

export function AssignLeadPanel({ leadId, currentOwnerId }: AssignLeadPanelProps) {
  const { data: users } = useUsers();
  const assignLead = useAssignLead();
  const [selectedUserId, setSelectedUserId] = useState(currentOwnerId ?? '');
  const [saved, setSaved] = useState(false);

  const handleAssign = async () => {
    if (!selectedUserId) return;
    await assignLead.mutateAsync({ id: leadId, userId: selectedUserId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Unassigned</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role}{u.team ? ` · ${u.team.name}` : ''})
            </option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={!selectedUserId || assignLead.isPending}
          className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-1.5"
        >
          <UserCheck size={14} />
          {saved ? 'Saved!' : 'Assign'}
        </button>
      </div>
      {assignLead.isError && (
        <p className="text-xs text-danger">Failed to assign. Please try again.</p>
      )}
    </div>
  );
}
