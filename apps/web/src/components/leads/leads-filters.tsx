'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

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
  { value: 'PHONE_INBOUND', label: 'Phone' },
  { value: 'MANUAL', label: 'Manual' },
];

const SELECT_CLS = 'text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white min-w-0 w-full sm:w-auto';

export function LeadsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Debounce the search box so we navigate/refetch once the user pauses typing,
  // not on every keystroke. Controlled so clearing the URL clears the field.
  const urlSearch = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(urlSearch);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => setFilter('search', searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, setFilter]);

  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
      {/* Search — full width on mobile */}
      <div className="relative w-full sm:flex-1 sm:min-w-40">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
        <input
          type="text"
          placeholder="Search name, phone..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Filters row on mobile: 2 columns */}
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <select
          value={searchParams.get('stage') ?? ''}
          onChange={(e) => setFilter('stage', e.target.value)}
          className={SELECT_CLS}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={searchParams.get('sourceType') ?? ''}
          onChange={(e) => setFilter('sourceType', e.target.value)}
          className={SELECT_CLS}
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={searchParams.get('sort') ?? 'createdAt'}
          onChange={(e) => setFilter('sort', e.target.value)}
          className={`${SELECT_CLS} col-span-2 sm:col-span-1`}
        >
          <option value="createdAt">Newest first</option>
          <option value="stageChangedAt">Stage changed</option>
          <option value="aiScore">AI score</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
    </div>
  );
}
