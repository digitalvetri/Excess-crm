'use client';

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  FolderOpen, Upload, Download, Trash2, FileText,
  FileImage, File, Loader2, X, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useUploadDocument,
  useDeleteDocument,
  useDocumentDownloadUrl,
  DOC_CATEGORY_LABEL,
  type ProjectDocument,
  type ProjectDocumentCategory,
} from '@/hooks/use-projects';

const DOC_CATEGORIES = Object.keys(DOC_CATEGORY_LABEL) as ProjectDocumentCategory[];

// ── File icon by MIME type ────────────────────────────────────────────────────
function FileIcon({ mime, size = 16 }: { mime: string | null; size?: number }) {
  if (mime?.startsWith('image/')) return <FileImage size={size} className="text-blue-500" />;
  if (mime === 'application/pdf') return <FileText size={size} className="text-red-500" />;
  return <File size={size} className="text-slate-400" />;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Upload form ───────────────────────────────────────────────────────────────
function UploadForm({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<ProjectDocumentCategory>('OTHER');
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument();

  async function handleUpload() {
    if (!file) return;
    try {
      await upload.mutateAsync({ id: projectId, file, category, name: name || file.name });
      toast.success('Document uploaded');
      onClose();
    } catch {
      toast.error('Upload failed — check your connection');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/3 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Upload Document</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={15} />
        </button>
      </div>

      {/* File picker */}
      <div
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 cursor-pointer transition-colors ${
          file ? 'border-primary/40 bg-primary/5' : 'border-border bg-white hover:border-primary/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.dwg,.xlsx,.xls,.docx,.doc"
          onChange={handleFileChange}
        />
        {file ? (
          <div className="flex items-center gap-2">
            <FileIcon mime={file.type} size={20} />
            <div>
              <div className="text-sm font-medium text-slate-800">{file.name}</div>
              <div className="text-xs text-slate-400">{formatBytes(file.size)}</div>
            </div>
          </div>
        ) : (
          <>
            <Upload size={20} className="text-slate-400 mb-2" />
            <p className="text-sm text-slate-500">Click to choose a file</p>
            <p className="text-xs text-slate-400 mt-0.5">PDF, Images, CAD, Excel, Word — max 20 MB</p>
          </>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ProjectDocumentCategory)}
            className="w-full appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>{DOC_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-slate-400" />
        </div>
      </div>

      {/* Display name */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Document name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={file?.name ?? 'Enter document name…'}
          className="w-full rounded-lg border border-border bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <button
        onClick={() => void handleUpload()}
        disabled={!file || upload.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {upload.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {upload.isPending ? 'Uploading…' : 'Upload'}
      </button>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({
  doc,
  projectId,
}: {
  doc: ProjectDocument;
  projectId: string;
}) {
  const download = useDocumentDownloadUrl();
  const remove   = useDeleteDocument();
  const [deleting, setDeleting] = useState(false);

  async function handleDownload() {
    try {
      const { url } = await download.mutateAsync({ projectId, docId: doc.id });
      window.open(url, '_blank', 'noopener');
    } catch {
      toast.error('Could not generate download link');
    }
  }

  async function handleDelete() {
    if (!deleting) { setDeleting(true); return; }
    try {
      await remove.mutateAsync({ projectId, docId: doc.id });
      toast.success('Document deleted');
    } catch {
      toast.error('Delete failed');
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2.5 hover:border-slate-300 transition-colors group">
      <FileIcon mime={doc.mimeType} size={18} />
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-slate-800">{doc.name}</div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
          <span>{DOC_CATEGORY_LABEL[doc.category]}</span>
          {doc.sizeBytes && <><span>·</span><span>{formatBytes(doc.sizeBytes)}</span></>}
          <span>·</span>
          <span>{format(new Date(doc.createdAt), 'd MMM yyyy')}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => void handleDownload()}
          disabled={download.isPending}
          title="Download"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary transition-colors disabled:opacity-40"
        >
          {download.isPending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        </button>

        {deleting ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-danger">Confirm?</span>
            <button
              onClick={() => void handleDelete()}
              disabled={remove.isPending}
              className="rounded-lg bg-danger px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
            >
              {remove.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
            </button>
            <button onClick={() => setDeleting(false)} className="text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            title="Delete"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-danger transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ProjectDocumentVault({
  projectId,
  documents,
}: {
  projectId: string;
  documents: ProjectDocument[];
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ProjectDocumentCategory | 'ALL'>('ALL');

  const filtered = categoryFilter === 'ALL'
    ? documents
    : documents.filter((d) => d.category === categoryFilter);

  // Categories that actually have docs (for filter chips)
  const presentCategories = [...new Set(documents.map((d) => d.category))];

  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <FolderOpen size={15} className="text-primary" />
          <h3 className="text-sm font-semibold text-slate-700">
            Document Vault
          </h3>
          {documents.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {documents.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
            showUpload
              ? 'bg-slate-100 text-slate-600'
              : 'bg-primary text-white hover:bg-primary/90'
          }`}
        >
          {showUpload ? <X size={13} /> : <Upload size={13} />}
          {showUpload ? 'Cancel' : 'Upload'}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Upload form */}
        {showUpload && (
          <UploadForm projectId={projectId} onClose={() => setShowUpload(false)} />
        )}

        {/* Category filter chips */}
        {presentCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategoryFilter('ALL')}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                categoryFilter === 'ALL'
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              All ({documents.length})
            </button>
            {presentCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  categoryFilter === cat
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {DOC_CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        )}

        {/* Document list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FolderOpen size={28} className="text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">
              {documents.length === 0 ? 'No documents uploaded yet' : 'No documents in this category'}
            </p>
            {documents.length === 0 && (
              <p className="mt-0.5 text-xs text-slate-300">
                Upload quotations, designs, approvals & certificates
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((doc) => (
              <DocRow key={doc.id} doc={doc} projectId={projectId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
