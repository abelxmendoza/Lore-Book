import {
  Briefcase,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  MessageSquare,
  Upload,
  Wrench,
  ChevronRight,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  ShieldAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  documentsApi,
  type DocumentFactQueryResult,
} from "../../api/documents";
import { logActivity } from "../../api/user";
import { fetchJson } from "../../lib/api";
import {
  DOCUMENT_CATEGORIES,
  documentCategoryLabel,
  documentSubtypeLabel,
  type DocumentCategory,
  type DocumentFolderFilter,
} from "../../lib/documentCategories";
import { openChatWithFocus } from "../../lib/openChatWithFocus";
import {
  dispatchStoryDataUpdated,
  onStoryDataUpdated,
} from "../../lib/storyRefresh";
import { supabase } from "../../lib/supabase";
import {
  DEMO_DOCUMENT_UPLOAD_STAGES,
  shouldSimulateDocumentUpload,
  simulateDemoDocumentUpload,
} from "../../services/demoDocumentUpload";
import {
  shouldSimulateResumeUpload,
  simulateDemoResumeUpload,
  DEMO_RESUME_UPLOAD_STAGES,
} from "../../services/demoResumeUpload";
import {
  CHAT_DOCUMENT_DRAG_TYPE,
  type ChatDocumentAttachment,
} from "../../types/chatFocus";
import { ClaimsInbox } from "../career/ClaimsInbox";
import { ProvenanceLinks } from "../career/ProvenanceLinks";
import {
  DemoUploadProgressPanel,
  type DemoUploadProgress,
  type DemoUploadStage,
} from "../demo/DemoUploadProgressPanel";

type DetailTab = "overview" | "claims" | "lore";

type LibraryFile = {
  id: string;
  filename: string;
  mimeType: string;
  kind: string | null;
  category: DocumentCategory;
  documentSubtype: string | null;
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
        employment?: Array<{
          company: string;
          title: string;
          startDate?: string;
          endDate?: string;
          isCurrent?: boolean;
        }>;
        education?: Array<{
          institution: string;
          degree?: string;
          field?: string;
        }>;
        skills?: string[];
        projects?: Array<{ name: string; description?: string }>;
        employmentGaps?: Array<{
          startDate: string;
          endDate: string;
          label: string;
        }>;
      };
    };
    rawTextPreview: string | null;
    uploadedAt: string;
    processedAt: string | null;
  } | null;
};

export function DocumentsBook() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryPage, setLibraryPage] = useState(1);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const [activeFolder, setActiveFolder] = useState<DocumentFolderFilter>("all");
  const [categoryCounts, setCategoryCounts] = useState<
    Partial<Record<DocumentCategory, number>>
  >({});
  const [totalFiles, setTotalFiles] = useState(0);
  const [uploadCategory, setUploadCategory] =
    useState<"auto" | DocumentCategory>("auto");
  const [dropFolder, setDropFolder] = useState<DocumentCategory | null>(null);
  const [movingFile, setMovingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] =
    useState<DemoUploadProgress | null>(null);
  const [uploadStages, setUploadStages] = useState<DemoUploadStage[]>(
    DEMO_DOCUMENT_UPLOAD_STAGES,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [factQuery, setFactQuery] = useState("");
  const [factResults, setFactResults] =
    useState<DocumentFactQueryResult | null>(null);
  const [factQuerying, setFactQuerying] = useState(false);
  const [factQueryError, setFactQueryError] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSortStartedRef = useRef(false);

  const recordDocumentActivity = useCallback(
    (action: string, metadata: Record<string, unknown> = {}) => {
      void logActivity(`documents.${action}`, {
        surface: "documents",
        ...metadata,
      });
    },
    [],
  );

  const loadCounts = useCallback(async () => {
    try {
      const result = await documentsApi.getCategoryCounts();
      setCategoryCounts(result.counts);
      setTotalFiles(result.total);
    } catch {
      // The file list remains usable if counts are temporarily unavailable.
    }
  }, []);

  const load = useCallback(
    async (page = 1) => {
      if (page === 1) setLoading(true);
      try {
        const res = await fetchJson<{
          success: boolean;
          files: LibraryFile[];
          pagination?: { page: number; hasMore: boolean };
        }>(
          `/api/documents/files?page=${page}&pageSize=25${
            activeFolder === "all" ? "" : `&category=${activeFolder}`
          }`,
        );
        if (res.success) {
          setFiles((previous) =>
            page === 1 ? res.files : [...previous, ...res.files],
          );
          setLibraryPage(res.pagination?.page ?? page);
          setHasMoreFiles(Boolean(res.pagination?.hasMore));
        }
      } catch {
        setFiles([]);
      } finally {
        if (page === 1) setLoading(false);
      }
    },
    [activeFolder],
  );

  useEffect(() => {
    if (autoSortStartedRef.current) {
      void load();
      void loadCounts();
      return;
    }
    autoSortStartedRef.current = true;
    let cancelled = false;
    void documentsApi
      .autoSort()
      .then((result) => {
        if (!cancelled && result.moved > 0) {
          setUploadMsg(
            `Automatically filed ${result.moved} document${result.moved === 1 ? "" : "s"}.`,
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          void load();
          void loadCounts();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load, loadCounts]);

  useEffect(
    () =>
      onStoryDataUpdated(() => {
        void load();
        void loadCounts();
      }, "all"),
    [load, loadCounts],
  );

  const loadMoreFiles = () => {
    if (!hasMoreFiles || loading) return;
    recordDocumentActivity("load_more", { page: libraryPage + 1 });
    void load(libraryPage + 1);
  };

  const openDetail = useCallback(
    async (id: string, options?: { preserveTab?: boolean }) => {
      recordDocumentActivity("open_file", { documentId: id });
      setSelectedId(id);
      if (!options?.preserveTab) setDetailTab("overview");
      setDetailLoading(true);
      try {
        const res = await fetchJson<FileDetail>(`/api/documents/files/${id}`);
        setDetail(res);
      } catch {
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [recordDocumentActivity],
  );

  useEffect(() => {
    const documentId = searchParams.get("documentId");
    if (!documentId || selectedId) return;
    void openDetail(documentId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("documentId");
    setSearchParams(nextParams, { replace: true });
  }, [openDetail, searchParams, selectedId, setSearchParams]);

  const uploadFile = async (file: File, asResume: boolean) => {
    const isPhoto = file.type.startsWith("image/");
    recordDocumentActivity("upload_started", {
      kind: isPhoto ? "photo" : asResume ? "resume" : "document",
    });
    setUploading(true);
    setUploadProgress(null);
    setUploadStages(
      asResume ? DEMO_RESUME_UPLOAD_STAGES : DEMO_DOCUMENT_UPLOAD_STAGES,
    );
    setUploadMsg(
      asResume && shouldSimulateResumeUpload() ? "Reading your resume…" : null,
    );
    try {
      if (asResume && shouldSimulateResumeUpload()) {
        await simulateDemoResumeUpload(file, (progress) => {
          setUploadProgress(progress);
          setUploadMsg(progress.stageLabel);
        });
        setUploadMsg("Resume saved to library (demo).");
        dispatchStoryDataUpdated({ scopes: ["all"], delayMs: 2000 });
        await load();
        recordDocumentActivity("upload_completed", {
          kind: asResume ? "resume" : "document",
          simulated: true,
        });
        return;
      }

      if (!asResume && !isPhoto && shouldSimulateDocumentUpload()) {
        await simulateDemoDocumentUpload(file, (progress) => {
          setUploadProgress(progress);
          setUploadMsg(progress.stageLabel);
        });
        setUploadMsg("Document saved to library.");
        dispatchStoryDataUpdated({ scopes: ["all"], delayMs: 2000 });
        await load();
        recordDocumentActivity("upload_completed", {
          kind: asResume ? "resume" : "document",
          simulated: true,
        });
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Please log in to upload.");

      const formData = new FormData();
      const endpoint = asResume
        ? "/api/resume/upload"
        : "/api/documents/upload";
      formData.append(asResume ? "resume" : "file", file);
      formData.append(
        "category",
        uploadCategory,
      );

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || data.message || "Upload failed");

      setUploadMsg(data.message || "Document processed.");
      dispatchStoryDataUpdated({ scopes: ["all"], delayMs: 2000 });
      if (asResume) {
        window.dispatchEvent(new Event("lk:characters-updated"));
      }
      await load();
      await loadCounts();
      recordDocumentActivity("upload_completed", {
        kind: isPhoto ? "photo" : asResume ? "resume" : "document",
        simulated: false,
      });
      if (data.userFileId) void openDetail(data.userFileId);
    } catch (e) {
      recordDocumentActivity("upload_failed", {
        kind: isPhoto ? "photo" : asResume ? "resume" : "document",
      });
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPhoto = file.type.startsWith("image/");
    const asResume =
      !isPhoto &&
      (uploadCategory === "resumes" ||
        name.includes("resume") ||
        name.includes("cv") ||
        name.includes("curriculum"));
    void uploadFile(file, asResume);
  };

  const moveSelectedFile = async (category: DocumentCategory) => {
    if (!selectedId || movingFile) return;
    setMovingFile(true);
    try {
      await documentsApi.moveToCategory(selectedId, category);
      recordDocumentActivity("move_file", {
        documentId: selectedId,
        category,
      });
      setDetail((previous) =>
        previous
          ? { ...previous, file: { ...previous.file, category } }
          : previous,
      );
      setFiles((previous) =>
        previous.map((file) =>
          file.id === selectedId ? { ...file, category } : file,
        ),
      );
      await Promise.all([load(), loadCounts()]);
      if (activeFolder !== "all" && activeFolder !== category) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error) {
      setUploadMsg(
        error instanceof Error ? error.message : "Could not move this file.",
      );
    } finally {
      setMovingFile(false);
    }
  };

  const moveFilesToFolder = async (
    attachments: ChatDocumentAttachment[],
    category: DocumentCategory,
  ) => {
    if (attachments.length === 0 || movingFile) return;
    setMovingFile(true);
    try {
      await Promise.all(
        attachments.map((attachment) =>
          documentsApi.moveToCategory(attachment.fileId, category),
        ),
      );
      recordDocumentActivity("drop_files_in_folder", {
        category,
        documentCount: attachments.length,
      });
      setUploadMsg(
        `Moved ${attachments.length} document${attachments.length === 1 ? "" : "s"} to ${documentCategoryLabel(category)}.`,
      );
      setSelectedDocumentIds((previous) =>
        previous.filter(
          (id) => !attachments.some((attachment) => attachment.fileId === id),
        ),
      );
      if (selectedId && attachments.some((attachment) => attachment.fileId === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
      await Promise.all([load(), loadCounts()]);
    } catch (error) {
      setUploadMsg(
        error instanceof Error ? error.message : "Could not move these files.",
      );
    } finally {
      setMovingFile(false);
      setDropFolder(null);
    }
  };

  const handleFolderDrop = (
    event: React.DragEvent<HTMLButtonElement>,
    category: DocumentCategory,
  ) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData(CHAT_DOCUMENT_DRAG_TYPE);
    if (!raw) return;
    try {
      const attachments = JSON.parse(raw) as ChatDocumentAttachment[];
      void moveFilesToFolder(attachments, category);
    } catch {
      setUploadMsg("Could not read the dragged documents.");
    }
  };

  const attachmentFor = (file: LibraryFile): ChatDocumentAttachment => ({
    fileId: file.id,
    fileName: file.filename,
    kind: file.kind,
    resumeDocumentId: file.resumeDocumentId,
  });

  const selectedAttachments = files
    .filter((file) => selectedDocumentIds.includes(file.id))
    .map(attachmentFor);

  const toggleDocumentSelection = (id: string) => {
    const selected = selectedDocumentIds.includes(id);
    recordDocumentActivity(selected ? "deselect_file" : "select_file", {
      documentId: id,
      selectedCount: selected
        ? selectedDocumentIds.length - 1
        : selectedDocumentIds.length + 1,
    });
    setSelectedDocumentIds((previous) => {
      return selected
        ? previous.filter((value) => value !== id)
        : [...previous, id];
    });
  };

  const attachmentsForDrag = (file: LibraryFile): ChatDocumentAttachment[] => {
    const selected = selectedAttachments;
    return selected.some((attachment) => attachment.fileId === file.id)
      ? selected
      : [attachmentFor(file)];
  };

  const handleDocumentDragStart = (
    event: React.DragEvent<HTMLLIElement>,
    file: LibraryFile,
  ) => {
    const attachments = attachmentsForDrag(file);
    recordDocumentActivity("drag_files", {
      documentId: file.id,
      attachmentCount: attachments.length,
    });
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData(
      CHAT_DOCUMENT_DRAG_TYPE,
      JSON.stringify(attachments),
    );
    event.dataTransfer.setData(
      "text/plain",
      attachments.map((attachment) => attachment.fileName).join(", "),
    );
  };

  const openSelectedDocumentsInChat = () => {
    if (selectedAttachments.length === 0) return;
    recordDocumentActivity("open_focused_chat", {
      selectedCount: selectedAttachments.length,
    });
    openChatWithFocus({
      entityId: "documents",
      entityName: `${selectedAttachments.length} document${selectedAttachments.length === 1 ? "" : "s"}`,
      entityType: "document",
      sourceSurface: "documents",
      sourceLabel: "Documents",
      knowledgeScope: "selected document evidence",
      documentAttachments: selectedAttachments,
      startNewThread: true,
    });
  };

  const runFactQuery = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = factQuery.trim();
    if (!query || factQuerying) return;
    setFactQuerying(true);
    setFactQueryError(null);
    try {
      recordDocumentActivity("query", { queryLength: query.length });
      const result = await documentsApi.queryFacts({ query, limit: 20 });
      setFactResults(result);
      recordDocumentActivity("query_result", { resultCount: result.total });
    } catch (error) {
      setFactResults(null);
      setFactQueryError(
        error instanceof Error
          ? error.message
          : "Could not search your documents.",
      );
    } finally {
      setFactQuerying(false);
    }
  };

  const structured = detail?.resume?.parsedData?.structured;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="mt-1 text-sm text-white/50">
            Keep lore documents in private folders, then use their evidence in
            your timeline, memory, and focused chats.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label
            className="text-xs text-white/55"
            htmlFor="document-upload-folder"
          >
            Save new upload in
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              id="document-upload-folder"
              value={uploadCategory}
              onChange={(event) => {
                const category = event.target.value as "auto" | DocumentCategory;
                recordDocumentActivity("choose_upload_category", { category });
                setUploadCategory(category);
              }}
              disabled={uploading}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-primary/50 focus:outline-none disabled:opacity-50"
            >
              <option value="auto">Automatic (recommended)</option>
              {DOCUMENT_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
              className="hidden"
              onChange={onFilePick}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                recordDocumentActivity("open_upload_picker");
                inputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload document or photo
            </button>
          </div>
          {uploadCategory === "personal_identity" && (
            <p className="flex max-w-md items-start gap-1.5 text-xs text-amber-200/80">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Identity records can contain highly sensitive information. Only
              upload what you want stored in your private LoreBook library.
            </p>
          )}
        </div>
      </header>

      {selectedAttachments.length > 0 && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {selectedAttachments.length} document
                {selectedAttachments.length === 1 ? "" : "s"} selected
              </p>
              <p className="mt-1 text-xs text-white/50">
                Open a focused chat to ask questions or tell LoreBook what
                grounded lore to grow from these files.
              </p>
            </div>
            <button
              type="button"
              onClick={openSelectedDocumentsInChat}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm text-primary hover:bg-primary/10"
            >
              <MessageSquare className="h-4 w-4" />
              Ask in focused chat
            </button>
          </div>
          <p className="mt-2 text-[11px] text-white/40">
            You can also drag the selected rows directly onto the chat composer.
          </p>
        </section>
      )}

      {uploading && uploadProgress ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <DemoUploadProgressPanel
            progress={uploadProgress}
            stages={uploadStages}
            icon={
              uploadStages === DEMO_RESUME_UPLOAD_STAGES ? Briefcase : FileText
            }
          />
        </div>
      ) : null}

      {uploadMsg && !uploadProgress && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-white flex flex-wrap items-center justify-between gap-2">
          <span>{uploadMsg}</span>
          <button
            type="button"
            onClick={() => navigate("/timeline")}
            className="text-xs text-primary hover:underline"
          >
            View timeline →
          </button>
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <form
          onSubmit={(event) => void runFactQuery(event)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={factQuery}
            onChange={(event) => setFactQuery(event.target.value)}
            placeholder="Ask your documents: What jobs, schools, or skills are listed?"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-primary/50 focus:outline-none"
            aria-label="Ask your documents"
          />
          <button
            type="submit"
            disabled={factQuerying || !factQuery.trim()}
            className="rounded-lg border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {factQuerying ? "Searching…" : "Ask"}
          </button>
        </form>
        {factQueryError && (
          <p className="mt-2 text-sm text-red-300">{factQueryError}</p>
        )}
        {factResults && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-white/45">
              {factResults.total} grounded result
              {factResults.total === 1 ? "" : "s"} ·{" "}
              {factResults.intent.replace(/_/g, " ")}
            </p>
            {factResults.facts.length === 0 ? (
              <p className="text-sm text-white/50">
                No completed document evidence matched that question.
              </p>
            ) : (
              <ul className="space-y-2">
                {factResults.facts.map((fact) => (
                  <li
                    key={`${fact.sourceTable}:${fact.sourceId}:${fact.fieldPath}`}
                    className="rounded-lg bg-black/20 px-3 py-2"
                  >
                    <p className="text-sm text-white/85">{fact.value}</p>
                    <p className="text-xs text-white/45">
                      {fact.filename} · {fact.fieldPath}
                    </p>
                    {fact.excerpt && (
                      <p className="mt-1 text-xs italic text-white/55">
                        “{fact.excerpt}”
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-7">
        <aside className="rounded-xl border border-white/10 bg-white/5 p-3 lg:col-span-2">
          <h2 className="mb-2 px-2 text-sm font-semibold uppercase tracking-wide text-white/60">
            Folders
          </h2>
          <p className="mb-2 px-2 text-[11px] text-white/40">
            Drag files onto a folder to move them.
          </p>
          <nav aria-label="Document folders" className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setActiveFolder("all");
                setSelectedId(null);
                setDetail(null);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                activeFolder === "all"
                  ? "bg-primary/15 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {activeFolder === "all" ? (
                <FolderOpen className="h-4 w-4 text-primary" />
              ) : (
                <Folder className="h-4 w-4 text-primary" />
              )}
              <span className="min-w-0 flex-1">All documents</span>
              <span className="text-xs text-white/35">{totalFiles}</span>
            </button>
            {DOCUMENT_CATEGORIES.map((category) => {
              const active = activeFolder === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveFolder(category.id);
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes(CHAT_DOCUMENT_DRAG_TYPE)) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropFolder(category.id);
                    }
                  }}
                  onDragLeave={() => setDropFolder(null)}
                  onDrop={(event) => handleFolderDrop(event, category.id)}
                  title={category.description}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    dropFolder === category.id
                      ? "bg-primary/25 text-white ring-1 ring-primary/60"
                      : active
                      ? "bg-primary/15 text-white"
                      : "text-white/65 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Folder className="h-4 w-4 shrink-0 text-primary/80" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {category.label}
                  </span>
                  {"sensitive" in category && category.sensitive && (
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-300/70" />
                  )}
                  <span className="text-xs text-white/35">
                    {categoryCounts[category.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/60">
            {activeFolder === "all"
              ? "Your files"
              : documentCategoryLabel(activeFolder)}
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-white/50">
              {activeFolder === "all"
                ? "No uploads yet. Choose a folder, then add a document."
                : "This folder is empty."}
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    draggable
                    onDragStart={(event) => handleDocumentDragStart(event, f)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <div
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                        selectedId === f.id
                          ? "border-primary bg-primary/10 text-white"
                          : "border-white/10 text-white/80 hover:border-primary/40"
                      }`}
                    >
                      {f.mimeType.startsWith("image/") ? (
                        <span
                          className="h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={selectedDocumentIds.includes(f.id)}
                          onChange={() => toggleDocumentSelection(f.id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select ${f.filename} for focused chat`}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => void openDetail(f.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        {f.mimeType.startsWith("image/") ? (
                          <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="truncate font-medium">{f.filename}</p>
                            {documentSubtypeLabel(f.documentSubtype) && (
                              <span className="shrink-0 rounded-full border border-amber-300/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200/90">
                                {documentSubtypeLabel(f.documentSubtype)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/40">
                            {documentCategoryLabel(f.category)} ·{" "}
                            {new Date(f.uploadedAt).toLocaleDateString()}
                            {f.parsedSummary &&
                              ` · ${f.parsedSummary.jobs} jobs`}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {hasMoreFiles && (
                <button
                  type="button"
                  onClick={loadMoreFiles}
                  disabled={loading}
                  className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:border-primary/40 hover:text-white disabled:opacity-50"
                >
                  Load more files
                </button>
              )}
            </>
          )}
        </section>

        <section className="lg:col-span-3 rounded-xl border border-white/10 bg-white/5 p-4 min-h-[320px]">
          {!selectedId ? (
            <p className="text-sm text-white/50">
              Select a file to review its details, move it to another folder, or
              download the original.
            </p>
          ) : detailLoading ? (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading details…
            </div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {detail.file.filename}
                  </h3>
                  <p className="text-xs text-white/40 capitalize">
                    {detail.file.processingStatus}
                  </p>
                  <label className="mt-3 block text-xs text-white/45">
                    Folder
                    <select
                      value={detail.file.category}
                      onChange={(event) =>
                        void moveSelectedFile(
                          event.target.value as DocumentCategory,
                        )
                      }
                      disabled={movingFile}
                      className="ml-2 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-primary/50 focus:outline-none disabled:opacity-50"
                    >
                      {DOCUMENT_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {detail.file.category === "personal_identity" && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-200/75">
                      <ShieldAlert className="h-3.5 w-3.5" /> Sensitive personal
                      record
                      {documentSubtypeLabel(detail.file.documentSubtype) &&
                        ` · ${documentSubtypeLabel(detail.file.documentSubtype)}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="text-white/40 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-1 border-b border-white/10 pb-2 mb-4">
                {(["overview", "claims", "lore"] as DetailTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      recordDocumentActivity("open_detail_tab", {
                        documentId: selectedId,
                        tab,
                      });
                      setDetailTab(tab);
                    }}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                      detailTab === tab
                        ? "bg-primary/20 text-primary"
                        : "text-white/45 hover:text-white/70"
                    }`}
                  >
                    {tab === "lore" ? "Lore links" : tab}
                  </button>
                ))}
              </div>

              {detailTab === "claims" && selectedId && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">
                    Review claims
                  </h4>
                  <ClaimsInbox
                    onUpdated={() =>
                      void openDetail(selectedId, { preserveTab: true })
                    }
                  />
                </div>
              )}

              {detailTab === "lore" && selectedId && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">
                    Added to your lore
                  </h4>
                  <ProvenanceLinks fileId={selectedId} />
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        recordDocumentActivity("open_timeline");
                        navigate("/timeline");
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Open timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        recordDocumentActivity("open_life_log");
                        navigate("/events");
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Open life log
                    </button>
                  </div>
                </div>
              )}

              {detailTab === "overview" && (
                <>
                  {detail.file.mimeType.startsWith("image/") &&
                    detail.file.storageUrl && (
                      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
                        <img
                          src={detail.file.storageUrl}
                          alt={detail.file.filename}
                          className="max-h-96 w-full object-contain"
                        />
                      </div>
                    )}
                  {(detail.resume?.fileUrl || detail.file.storageUrl) && (
                    <a
                      href={
                        detail.resume?.fileUrl || detail.file.storageUrl || "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordDocumentActivity("download_original", {
                          documentId: selectedId,
                        })
                      }
                      className="text-sm text-primary hover:underline"
                    >
                      Download original file
                    </a>
                  )}

                  {structured?.contact &&
                    Object.values(structured.contact).some(Boolean) && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-white/50">
                          <Mail className="h-3.5 w-3.5" /> Contact
                        </h4>
                        <dl className="grid grid-cols-2 gap-2 text-sm text-white/80">
                          {structured.contact.email && (
                            <>
                              <dt className="text-white/40">Email</dt>
                              <dd>{structured.contact.email}</dd>
                            </>
                          )}
                          {structured.contact.phone && (
                            <>
                              <dt className="text-white/40">Phone</dt>
                              <dd>{structured.contact.phone}</dd>
                            </>
                          )}
                          {structured.contact.address && (
                            <>
                              <dt className="text-white/40 col-span-2">
                                Address
                              </dt>
                              <dd className="col-span-2">
                                {structured.contact.address}
                              </dd>
                            </>
                          )}
                          {structured.contact.website && (
                            <>
                              <dt className="text-white/40">Website</dt>
                              <dd>{structured.contact.website}</dd>
                            </>
                          )}
                        </dl>
                      </div>
                    )}

                  {structured?.employment &&
                    structured.employment.length > 0 && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-white/50">
                          <Briefcase className="h-3.5 w-3.5" /> Employment
                        </h4>
                        <ul className="space-y-2 text-sm">
                          {structured.employment.map((job, i) => (
                            <li
                              key={i}
                              className="rounded-lg bg-black/20 px-3 py-2 text-white/80"
                            >
                              <span className="font-medium text-white">
                                {job.title}
                              </span>{" "}
                              at {job.company}
                              <span className="block text-xs text-white/40">
                                {[
                                  job.startDate,
                                  job.endDate ??
                                    (job.isCurrent ? "Present" : null),
                                ]
                                  .filter(Boolean)
                                  .join(" – ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {structured?.employmentGaps &&
                    structured.employmentGaps.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">
                          Between jobs
                        </h4>
                        <ul className="text-sm text-white/60 space-y-1">
                          {structured.employmentGaps.map((g, i) => (
                            <li key={i}>
                              {g.label}: {g.startDate} → {g.endDate}
                            </li>
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
                          <li key={i}>
                            {[edu.degree, edu.field, edu.institution]
                              .filter(Boolean)
                              .join(" — ")}
                          </li>
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
                          <span
                            key={s}
                            className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {structured?.projects && structured.projects.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase text-white/50">
                        Projects
                      </h4>
                      <ul className="space-y-1 text-sm text-white/80">
                        {structured.projects.map((p, i) => (
                          <li key={i}>
                            <span className="font-medium">{p.name}</span>
                            {p.description ? ` — ${p.description}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-white/40 pt-2 border-t border-white/10">
                    Added to lore: {detail.file.derivedCounts?.moments ?? 0}{" "}
                    entries · {detail.file.derivedCounts?.events ?? 0} timeline
                    events · {detail.resume?.claimsGenerated ?? 0} claims
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
