'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import type { Route } from 'next';
import { Search, Filter } from 'lucide-react';

const STAGES = [
  { value: '', label: 'All stages' },
  { value: 'NEW', label: 'New' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'NOT_ANSWERED', label: 'Not Answered' },
  { value: 'INVALID', label: 'Invalid' },
  { value: 'WRONG_ENQUIRY', label: 'Wrong Enquiry' },
];

const SOURCES = [
  { value: '', label: 'All sources' },
  { value: 'META', label: 'Meta' },
  { value: 'INDIAMART', label: 'IndiaMART' },
  { value: 'JUSTDIAL', label: 'JustDial' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'MANUAL', label: 'Manual' },
];

export function LeadsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}` as Route);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-border rounded-xl px-4 py-3">
      <div className="relative flex-1 min-w-40">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search name, phone..."
          defaultValue={searchParams.get('search') ?? ''}
          onChange={(e) => setFilter('search', e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <select
        value={searchParams.get('stage') ?? ''}
        onChange={(e) => setFilter('stage', e.target.value)}
        className="text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
      >
        {STAGES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        value={searchParams.get('sourceType') ?? ''}
        onChange={(e) => setFilter('sourceType', e.target.value)}
        className="text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        value={searchParams.get('sort') ?? 'createdAt'}
        onChange={(e) => setFilter('sort', e.target.value)}
        className="text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
      >
        <option value="createdAt">Newest first</option>
        <option value="stageChangedAt">Stage changed</option>
        <option value="aiScore">AI score</option>
        <option value="name">Name A–Z</option>
      </select>
    </div>
  );
}
