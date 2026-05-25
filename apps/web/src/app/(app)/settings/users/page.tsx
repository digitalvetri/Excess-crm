import { Suspense } from 'react';
import { UsersManager } from '@/components/settings/users-manager';

export const metadata = { title: 'User Management — Excess CRM' };

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Create and manage employee and franchise logins.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 bg-white rounded-xl animate-pulse" />}>
        <UsersManager />
      </Suspense>
    </div>
  );
}
