import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  Upload,
  Wrench,
  ChevronRight,
  X,
} from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { dispatchStoryDataUpdated, onStoryDataUpdated } from '../../lib/storyRefresh';
import { supabase } from '../../lib/supabase';
import { ClaimsInbox } from '../career/ClaimsInbox';
import { ProvenanceLinks } from '../career/ProvenanceLinks';

type DetailTab = 'overview' | 'claims' | 'lore';

type LibraryFile = {
  id: string;
  filename: string;
  mimeType: string;
  kind: string | null;
  uploadedAt: string;
  processingStatus: string;
  storageUrl: string | null;
  derivedCounts: {
    moments: number;
    facts: number;
    entities: number;
    events: number;
  };
  claimsGenerated: number | null;
  parsedSummary: { jobs: number; skills: number; schools: number } | null;
  resumeDocumentId: string | null;
};

type FileDetail = {
  success: boolean;
  file: LibraryFile & { errorMessage?: string | null };
  resume: {
    id: string;
    fileName: string;
    processingStatus: string;
    claimsGenerated: number;
    fileUrl: string | null;
    parsedData: {
      structured?: {
        contact?: Record<string, string>;
        employment?: Array<{ company: string; title: string; startDate?: string; endDate?: string; isCurrent?: boolean }>;
        education?: Array<{ institution: string; degree?: string; field?: string }>;
        skills?: string[];
        projects?: Array<{ name: string; description?: string }>;
        employmentGaps?: Array<{ startDate: string; endDate: string; label: string }>;
      };
    };
    rawTextPreview: string | null;
    uploadedAt: string;
    processedAt: string | null;
  } | null;
};

export function DocumentsBook() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJson<{ success: boolean; files: LibraryFile[] }>('/api/documents/files');
      if (res.success) setFiles(res.files);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onStoryDataUpdated(() => { void load(); }, 'all'), [load]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailTab('overview');
    setDetailLoading(true);
    try {
      const res = await fetchJson<FileDetail>(`/api/documents/files/${id}`);
      setDetail(res);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const uploadFile = async (file: File, asResume: boolean) => {
    setUploading(true);
    setUploadMsg(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Please log in to upload.');

      const formData = new FormData();
      const endpoint = asResume ? '/api/resume/upload' : '/api/documents/upload';
      formData.append(asResume ? 'resume' : 'file', file);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');

      setUploadMsg(data.message || 'Document processed.');
      dispatchStoryDataUpdated({ scopes: ['all'], delayMs: 2000 });
      if (asResume) {
        window.dispatchEvent(new Event('lk:characters-updated'));
      }
      await load();
      if (data.userFileId) void openDetail(data.userFileId);
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const asResume = name.includes('resume') || name.includes('cv') || name.includes('curriculum');
    void uploadFile(file, asResume);
  };

  const structured = detail?.resume?.parsedData?.structured;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="mt-1 text-sm text-white/50">
            Upload resumes and documents. Parsed career history flows into your timeline, skills, and lore.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md"
            className="hidden"
            onChange={onFilePick}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload resume or document
          </button>
        </div>
      </header>

      {uploadMsg && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-white flex flex-wrap items-center justify-between gap-2">
          <span>{uploadMsg}</span>
          <button
            type="button"
            onClick={() => navigate('/timeline')}
            className="text-xs text-primary hover:underline"
          >
            View timeline →
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">Your files</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-white/50">No uploads yet. Add a resume to seed your career lore.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => void openDetail(f.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      selectedId === f.id
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-white/10 text-white/80 hover:border-primary/40'
                    }`}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{f.filename}</p>
                      <p className="text-xs text-white/40">
                        {f.kind ?? 'document'} · {new Date(f.uploadedAt).toLocaleDateString()}
                        {f.parsedSummary && ` · ${f.parsedSummary.jobs} jobs`}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-3 rounded-xl border border-white/10 bg-white/5 p-4 min-h-[320px]">
          {!selectedId ? (
            <p className="text-sm text-white/50">Select a file to view parsed career data and download the original.</p>
          ) : detailLoading ? (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">{detail.file.filename}</h3>
                  <p className="text-xs text-white/40 capitalize">{detail.file.processingStatus}</p>
                </div>
                <button type="button" onClick={() => { setSelectedId(null); setDetail(null); }} className="text-white/40 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-1 border-b border-white/10 pb-2 mb-4">
                {(['overview', 'claims', 'lore'] as DetailTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDetailTab(tab)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                      detailTab === tab
                        ? 'bg-primary/20 text-primary'
                        : 'text-white/45 hover:text-white/70'
                    }`}
                  >
                    {tab === 'lore' ? 'Lore links' : tab}
                  </button>
                ))}
              </div>

              {detailTab === 'claims' && selectedId && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">Review claims</h4>
                  <ClaimsInbox onUpdated={() => void openDetail(selectedId)} />
                </div>
              )}

              {detailTab === 'lore' && selectedId && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">Added to your lore</h4>
                  <ProvenanceLinks fileId={selectedId} />
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/timeline')}
                      className="text-xs text-primary hover:underline"
                    >
                      Open timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/events')}
                      className="text-xs text-primary hover:underline"
                    >
                      Open life log
                    </button>
                  </div>
                </div>
              )}

              {detailTab === 'overview' && (
              <>
              {(detail.resume?.fileUrl || detail.file.storageUrl) && (
                <a
                  href={detail.resume?.fileUrl || detail.file.storageUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  Download original file
                </a>
              )}

              {structured?.contact && Object.values(structured.contact).some(Boolean) && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-white/50">
                    <Mail className="h-3.5 w-3.5" /> Contact
                  </h4>
                  <dl className="grid grid-cols-2 gap-2 text-sm text-white/80">
                    {structured.contact.email && <><dt className="text-white/40">Email</dt><dd>{structured.contact.email}</dd></>}
                    {structured.contact.phone && <><dt className="text-white/40">Phone</dt><dd>{structured.contact.phone}</dd></>}
                    {structured.contact.address && <><dt className="text-white/40 col-span-2">Address</dt><dd className="col-span-2">{structured.contact.address}</dd></>}
                    {structured.contact.website && <><dt className="text-white/40">Website</dt><dd>{structured.contact.website}</dd></>}
                  </dl>
                </div>
              )}

              {structured?.employment && structured.employment.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-white/50">
                    <Briefcase className="h-3.5 w-3.5" /> Employment
                  </h4>
                  <ul className="space-y-2 text-sm">
                    {structured.employment.map((job, i) => (
                      <li key={i} className="rounded-lg bg-black/20 px-3 py-2 text-white/80">
                        <span className="font-medium text-white">{job.title}</span> at {job.company}
                        <span className="block text-xs text-white/40">
                          {[job.startDate, job.endDate ?? (job.isCurrent ? 'Present' : null)].filter(Boolean).join(' – ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {structured?.employmentGaps && structured.employmentGaps.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">Between jobs</h4>
                  <ul className="text-sm text-white/60 space-y-1">
                    {structured.employmentGaps.map((g, i) => (
                      <li key={i}>{g.label}: {g.startDate} → {g.endDate}</li>
                    ))}
                  </ul>
                </div>
              )}

              {structured?.education && structured.education.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-white/50">
                    <GraduationCap className="h-3.5 w-3.5" /> Education
                  </h4>
                  <ul className="space-y-1 text-sm text-white/80">
                    {structured.education.map((edu, i) => (
                      <li key={i}>{[edu.degree, edu.field, edu.institution].filter(Boolean).join(' — ')}</li>
                    ))}
                  </ul>
                </div>
              )}

              {structured?.skills && structured.skills.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-white/50">
                    <Wrench className="h-3.5 w-3.5" /> Skills
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {structured.skills.map((s) => (
                      <span key={s} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {structured?.projects && structured.projects.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">Projects</h4>
                  <ul className="space-y-1 text-sm text-white/80">
                    {structured.projects.map((p, i) => (
                      <li key={i}><span className="font-medium">{p.name}</span>{p.description ? ` — ${p.description}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-white/40 pt-2 border-t border-white/10">
                Added to lore: {detail.file.derivedCounts?.moments ?? 0} entries · {detail.file.derivedCounts?.events ?? 0} timeline events · {detail.resume?.claimsGenerated ?? 0} claims
              </p>
              </>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
