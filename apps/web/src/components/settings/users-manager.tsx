'use client';

import { useState } from 'react';
import {
  Plus, Search, X, Loader2, UserCheck, UserX, KeyRound,
  ChevronRight, Users, Building2, BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdminUsers,
  useAdminUser,
  useFranchiseTenants,
  useCreateUser,
  useUpdateUser,
  useResetPassword,
  useToggleUserStatus,
  type AdminUser,
  type UsersFilters,
} from '@/hooks/use-users';

const ROLE_OPTIONS = [
  { value: 'EMPLOYEE',        label: 'Employee',        group: 'HQ' },
  { value: 'ENGINEER',        label: 'Field Engineer',  group: 'HQ' },
  { value: 'FRANCHISE_OWNER', label: 'Franchise Owner', group: 'Franchise' },
  { value: 'FRANCHISE_USER',  label: 'Franchise Staff', group: 'Franchise' },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN:           'HQ Administrator',
  EMPLOYEE:        'Employee',
  ENGINEER:        'Field Engineer',
  FRANCHISE_OWNER: 'Franchise Owner',
  FRANCHISE_USER:  'Franchise Staff',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:           'bg-purple-100 text-purple-700',
  EMPLOYEE:        'bg-blue-100 text-blue-700',
  ENGINEER:        'bg-cyan-100 text-cyan-700',
  FRANCHISE_OWNER: 'bg-amber-100 text-amber-700',
  FRANCHISE_USER:  'bg-orange-100 text-orange-700',
};

function isFranchiseRole(role: string) {
  return role === 'FRANCHISE_OWNER' || role === 'FRANCHISE_USER';
}

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'EMPLOYEE', tenantId: '', password: '', confirmPassword: '',
  });
  const { data: tenants } = useFranchiseTenants();
  const create = useCreateUser();

  const needsTenant = isFranchiseRole(form.role);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (needsTenant && !form.tenantId) {
      toast.error('Please select a franchise');
      return;
    }
    try {
      const payload: Parameters<typeof create.mutateAsync>[0] = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        password: form.password,
      };
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (needsTenant && form.tenantId) payload.tenantId = form.tenantId;
      await create.mutateAsync(payload);
      toast.success(`User "${form.name.trim()}" created`);
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to create user';
      toast.error(msg);
    }
  }

  function field(label: string, key: keyof typeof form, type = 'text', placeholder = '') {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-auto p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-slate-800">Create New User</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field('Full Name *', 'name', 'text', 'Ravi Kumar')}
            {field('Email *', 'email', 'email', 'ravi@excessindia.com')}
          </div>
          {field('Phone', 'phone', 'tel', '+91 99999 00000')}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role *</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value, tenantId: '' }))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label} ({r.group})</option>
              ))}
            </select>
          </div>

          {needsTenant && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Franchise *</label>
              <select
                value={form.tenantId}
                onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">Select franchise…</option>
                {(tenants ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.tier ? ` (${t.tier})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {field('Password *', 'password', 'password', 'Min 8 characters')}
            {field('Confirm Password *', 'confirmPassword', 'password', 'Re-enter password')}
          </div>

          <p className="text-xs text-slate-500">
            Share credentials securely out-of-band. The user can change their password after first login.
          </p>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!form.name || !form.email || !form.password || create.isPending}
              className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              {create.isPending && <Loader2 size={14} className="animate-spin" />}
              Create User
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-border text-slate-600 text-sm rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const reset = useResetPassword(userId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await reset.mutateAsync(password);
      toast.success(`Password reset for ${userName}. All existing sessions ended.`);
      onClose();
    } catch {
      toast.error('Failed to reset password');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Reset Password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Setting a new password for <strong>{userName}</strong> will immediately end all their active sessions.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!password || !confirm || reset.isPending}
              className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              {reset.isPending && <Loader2 size={14} className="animate-spin" />}
              Reset Password
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-border text-slate-600 text-sm rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── User Detail Drawer ───────────────────────────────────────────────────────

function UserDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: user, isLoading } = useAdminUser(userId);
  const [editMode, setEditMode] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', role: '' });
  const update = useUpdateUser(userId);
  const toggle = useToggleUserStatus(userId);

  function startEdit() {
    if (!user) return;
    setForm({ name: user.name, phone: user.phone ?? '', role: user.role });
    setEditMode(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const patch: Parameters<typeof update.mutateAsync>[0] = { name: form.name.trim() };
      if (form.phone.trim()) patch.phone = form.phone.trim();
      await update.mutateAsync(patch);
      toast.success('User updated');
      setEditMode(false);
    } catch {
      toast.error('Failed to update user');
    }
  }

  async function handleToggle() {
    if (!user) return;
    const next = !user.isActive;
    try {
      await toggle.mutateAsync(next);
      toast.success(next ? 'User activated' : 'User deactivated. All sessions ended.');
    } catch {
      toast.error('Failed to change user status');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-slate-800">User Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {isLoading || !user ? (
          <div className="flex-1 p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Avatar + header */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] ?? 'bg-slate-100 text-slate-600'}`}>
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Info grid */}
            {!editMode ? (
              <dl className="space-y-3">
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Tenant</dt>
                  <dd className="text-slate-800 font-medium flex items-center gap-1">
                    {user.tenant.type === 'FRANCHISE' ? <Building2 size={13} /> : <BadgeCheck size={13} />}
                    {user.tenant.name}
                  </dd>
                </div>
                {user.team && (
                  <div className="flex justify-between text-sm">
                    <dt className="text-slate-500">Team</dt>
                    <dd className="text-slate-800 font-medium">{user.team.name}</dd>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="text-slate-800 font-medium">{user.phone ?? '—'}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Last Login</dt>
                  <dd className="text-slate-800 font-medium">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                  </dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500">Created</dt>
                  <dd className="text-slate-800 font-medium">{new Date(user.createdAt).toLocaleDateString('en-IN')}</dd>
                </div>
              </dl>
            ) : (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={update.isPending}
                    className="flex-1 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {update.isPending && <Loader2 size={13} className="animate-spin" />}
                    Save
                  </button>
                  <button type="button" onClick={() => setEditMode(false)} className="flex-1 py-2 border border-border text-slate-600 text-sm rounded-lg hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Actions */}
            {!editMode && (
              <div className="space-y-2 pt-2 border-t border-border">
                <button
                  onClick={startEdit}
                  className="w-full text-sm text-left px-4 py-2.5 rounded-lg border border-border hover:bg-slate-50 transition-colors font-medium text-slate-700"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => setShowReset(true)}
                  className="w-full text-sm text-left px-4 py-2.5 rounded-lg border border-border hover:bg-slate-50 transition-colors font-medium text-slate-700 flex items-center gap-2"
                >
                  <KeyRound size={14} /> Reset Password
                </button>
                <button
                  onClick={handleToggle}
                  disabled={toggle.isPending}
                  className={`w-full text-sm text-left px-4 py-2.5 rounded-lg border transition-colors font-medium flex items-center gap-2 ${
                    user.isActive
                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                      : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {toggle.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : user.isActive ? (
                    <UserX size={14} />
                  ) : (
                    <UserCheck size={14} />
                  )}
                  {user.isActive ? 'Deactivate User' : 'Activate User'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showReset && user && (
        <ResetPasswordModal userId={userId} userName={user.name} onClose={() => setShowReset(false)} />
      )}
    </>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({ user, onSelect }: { user: AdminUser; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left border-b border-border last:border-0"
    >
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
        {user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
        <p className="text-xs text-slate-500 truncate">{user.email}</p>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] ?? 'bg-slate-100 text-slate-600'}`}>
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
        <span className={`text-xs ${user.isActive ? 'text-green-600' : 'text-red-500'}`}>
          {user.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="hidden md:block text-xs text-slate-400 shrink-0 w-28 truncate">
        {user.tenant.name}
      </div>
      <ChevronRight size={14} className="text-slate-300 shrink-0" />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsersManager() {
  const [filters, setFilters] = useState<UsersFilters>({});
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeFilters: UsersFilters = { ...filters, ...(search.trim() ? { search: search.trim() } : {}) };
  const { data, isLoading } = useAdminUsers(activeFilters);
  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
            />
          </div>

          {/* Role filter */}
          <select
            value={filters.role ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setFilters((f) => { const n = { ...f }; if (v) n.role = v; else delete n.role; return n; });
            }}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={filters.status ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setFilters((f) => { const n = { ...f }; if (v) n.status = v; else delete n.status; return n; });
            }}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 bg-slate-50 border-b border-border text-xs font-medium text-slate-500 uppercase tracking-wide">
          <span className="flex items-center gap-2"><Users size={12} /> User</span>
          <span className="hidden sm:block">Role / Status</span>
          <span className="hidden md:block">Tenant</span>
        </div>

        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
                <div className="w-9 h-9 rounded-full bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-slate-100 rounded animate-pulse w-36" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Users size={32} strokeWidth={1.5} />
            <p className="text-sm">No users found</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs text-primary hover:underline"
            >
              Create the first user
            </button>
          </div>
        ) : (
          users.map((u) => (
            <UserRow key={u.id} user={u} onSelect={() => setSelectedId(u.id)} />
          ))
        )}
      </div>

      {users.length > 0 && (
        <p className="text-xs text-slate-400 text-right">{users.length} user{users.length !== 1 ? 's' : ''} shown</p>
      )}

      {/* Modals / Drawers */}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {selectedId && <UserDrawer userId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
