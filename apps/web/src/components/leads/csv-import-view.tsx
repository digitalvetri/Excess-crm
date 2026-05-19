'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const LEAD_FIELDS = [
  { key: 'name', label: 'Name *', required: true },
  { key: 'phone', label: 'Phone *', required: true },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'utmSource', label: 'UTM Source' },
  { key: 'utmMedium', label: 'UTM Medium' },
  { key: 'utmCampaign', label: 'UTM Campaign' },
] as const;

type LeadFieldKey = (typeof LEAD_FIELDS)[number]['key'];

interface UploadResponse {
  importId: string;
  filename: string;
  totalRows: number;
  headers: string[];
  preview: string[][];
}

interface ImportStatus {
  id: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  errors: { row: number; message: string }[];
}

type Step = 'upload' | 'mapping' | 'processing' | 'done';

export function CsvImportView() {
  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [fieldMap, setFieldMap] = useState<Partial<Record<LeadFieldKey, string>>>({});
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Only CSV files are accepted');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ data: UploadResponse }>('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(res.data.data);

      // Auto-detect field mappings from column names
      const autoMap: Partial<Record<LeadFieldKey, string>> = {};
      for (const header of res.data.data.headers) {
        const lower = header.toLowerCase().trim();
        if (lower.includes('name') && !lower.includes('campaign')) autoMap['name'] = header;
        else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('contact')) autoMap['phone'] = header;
        else if (lower.includes('email')) autoMap['email'] = header;
        else if (lower.includes('city')) autoMap['city'] = header;
        else if (lower.includes('state')) autoMap['state'] = header;
        else if (lower.includes('pin') || lower.includes('postal')) autoMap['pincode'] = header;
        else if (lower === 'utm_source' || lower === 'utmsource') autoMap['utmSource'] = header;
        else if (lower === 'utm_medium' || lower === 'utmmedium') autoMap['utmMedium'] = header;
        else if (lower === 'utm_campaign' || lower === 'utmcampaign') autoMap['utmCampaign'] = header;
      }
      setFieldMap(autoMap);
      setStep('mapping');
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  }

  async function startImport() {
    if (!uploadResult) return;
    if (!fieldMap['name'] || !fieldMap['phone']) {
      toast.error('You must map Name and Phone columns');
      return;
    }

    try {
      await api.post(`/leads/import/${uploadResult.importId}/start`, { fieldMap });
      setStep('processing');
      pollStatus(uploadResult.importId);
    } catch {
      toast.error('Failed to start import');
    }
  }

  function pollStatus(importId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ data: ImportStatus }>(`/leads/import/${importId}`);
        setImportStatus(res.data.data);
        if (res.data.data.status === 'DONE' || res.data.data.status === 'FAILED') {
          clearInterval(pollRef.current!);
          setStep('done');
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('upload');
    setUploadResult(null);
    setFieldMap({});
    setImportStatus(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/leads" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> Leads
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium">Import CSV</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import Leads from CSV</h1>
        <p className="text-sm text-slate-500 mt-1">Upload a CSV file, map columns, and import leads in bulk.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'mapping', 'processing', 'done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-slate-200" />}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              step === s ? 'bg-primary text-white' :
              ['upload', 'mapping', 'processing', 'done'].indexOf(step) > i ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {['upload', 'mapping', 'processing', 'done'].indexOf(step) > i && <CheckCircle size={11} />}
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p className="text-slate-500">Uploading and parsing CSV...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload size={36} className="text-slate-400" />
              <div>
                <p className="font-medium text-slate-700">Drop your CSV file here</p>
                <p className="text-sm text-slate-400 mt-1">or click to browse · Max 10 MB</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Field Mapping */}
      {step === 'mapping' && uploadResult && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-400" />
                <span className="font-medium text-slate-800">{uploadResult.filename}</span>
                <span className="text-xs text-slate-400">· {uploadResult.totalRows.toLocaleString()} rows</span>
              </div>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            <h3 className="text-sm font-semibold text-slate-700 mb-3">Map CSV Columns to Lead Fields</h3>
            <div className="space-y-3">
              {LEAD_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-slate-600 shrink-0">
                    {field.label}
                  </div>
                  <div className="flex-1">
                    <select
                      value={fieldMap[field.key] ?? ''}
                      onChange={(e) => setFieldMap((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))}
                      className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      <option value="">— skip —</option>
                      {uploadResult.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          {uploadResult.preview.length > 0 && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-slate-700">Preview (first {uploadResult.preview.length} rows)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-50">
                      {uploadResult.headers.map((h) => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.preview.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-slate-600 max-w-[150px] truncate">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => void startImport()}
              disabled={!fieldMap['name'] || !fieldMap['phone']}
              className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-xl disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              Import {uploadResult.totalRows.toLocaleString()} leads
            </button>
            <button onClick={reset} className="px-4 py-2.5 border border-border rounded-xl text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Processing */}
      {step === 'processing' && (
        <div className="bg-white rounded-xl border border-border p-8 text-center space-y-4">
          <Loader2 size={36} className="animate-spin text-primary mx-auto" />
          <p className="font-medium text-slate-700">Importing leads...</p>
          {importStatus && (
            <div className="space-y-2">
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${importStatus.totalRows > 0 ? Math.round((importStatus.processedRows / importStatus.totalRows) * 100) : 0}%` }}
                />
              </div>
              <p className="text-sm text-slate-500">
                {importStatus.processedRows.toLocaleString()} / {importStatus.totalRows.toLocaleString()} rows processed
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && importStatus && (
        <div className="bg-white rounded-xl border border-border p-8 space-y-4">
          <div className="flex items-center gap-3">
            {importStatus.status === 'DONE' ? (
              <CheckCircle size={28} className="text-success" />
            ) : (
              <AlertCircle size={28} className="text-danger" />
            )}
            <div>
              <p className="font-semibold text-slate-800">
                {importStatus.status === 'DONE' ? 'Import complete' : 'Import failed'}
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                {importStatus.processedRows.toLocaleString()} leads queued · {importStatus.errorRows} errors
              </p>
            </div>
          </div>

          {importStatus.errors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-4 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-danger mb-2">Errors ({importStatus.errors.length})</p>
              {importStatus.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700">{e.message}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Link
              href="/leads"
              className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-xl text-center hover:bg-primary/90 transition-colors"
            >
              View Leads
            </Link>
            <button onClick={reset} className="px-4 py-2.5 border border-border rounded-xl text-sm text-slate-600 hover:bg-slate-50">
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
