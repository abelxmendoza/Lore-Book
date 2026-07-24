import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileArchive,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getChatGPTExportReminder,
  updateChatGPTExportReminder,
  type ChatGPTExportReminderState,
} from '../../api/chatGPTExportReminder';
import {
  analyzeChatGPTExport,
  deleteChatGPTExportSource,
  processChatGPTExport,
  type ChatGPTExportInventory,
  type ChatGPTLoreProgress,
} from '../../api/chatGPTLoreMigration';

type Props = {
  onOpenMemoryReview: () => void;
};

const CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity',
  relationships: 'People & relationships',
  projects: 'Projects',
  skills_interests: 'Skills & interests',
  goals_values: 'Goals & values',
  places_organizations: 'Places & organizations',
  timeline: 'Timeline',
  preferences_habits: 'Preferences & habits',
  other: 'Other profile lore',
};

export function ChatGPTLoreMigration({ onOpenMemoryReview }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inventory, setInventory] = useState<ChatGPTExportInventory | null>(null);
  const [sourceFileId, setSourceFileId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [titleQuery, setTitleQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [deleteAfterImport, setDeleteAfterImport] = useState(true);
  const [showConversations, setShowConversations] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ChatGPTLoreProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceDeleted, setSourceDeleted] = useState(false);
  const [reminder, setReminder] = useState<ChatGPTExportReminderState | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);

  useEffect(() => {
    getChatGPTExportReminder().then(setReminder).catch(() => {});
  }, []);

  const scheduleReminder = async () => {
    setReminderSaving(true);
    setError(null);
    try {
      setReminder(await updateChatGPTExportReminder('requested', 3));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the reminder. Please try again.');
    } finally {
      setReminderSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!inventory) return [];
    const query = titleQuery.trim().toLowerCase();
    return inventory.conversations.filter((conversation) => {
      if (query && !conversation.title.toLowerCase().includes(query)) return false;
      const created = new Date(conversation.createdAt ?? conversation.updatedAt ?? 0).getTime();
      if (dateFrom && created < new Date(dateFrom).getTime()) return false;
      if (dateTo && created > new Date(dateTo).getTime() + 86_400_000 - 1) return false;
      return true;
    });
  }, [inventory, titleQuery, dateFrom, dateTo]);

  const selectedFilteredCount = filtered.filter((conversation) => selectedIds.has(conversation.id)).length;
  const effectiveSelectedIds = filtered
    .filter((conversation) => selectedIds.has(conversation.id))
    .map((conversation) => conversation.id);

  const handleFile = async (file: File) => {
    setAnalyzing(true);
    setError(null);
    setProgress(null);
    setSourceDeleted(false);
    try {
      const result = await analyzeChatGPTExport(file);
      setInventory(result.inventory);
      setSourceFileId(result.sourceFileId);
      setReminder((current) => current ? {
        ...current,
        status: 'uploaded',
        sourceFileId: result.sourceFileId,
        remindAt: null,
        shouldRemind: false,
      } : current);
      setSelectedIds(new Set(result.inventory.conversations.map((conversation) => conversation.id)));
      setShowConversations(result.inventory.conversationCount <= 30);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not analyze this export.');
    } finally {
      setAnalyzing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const startImport = async () => {
    if (!sourceFileId || effectiveSelectedIds.length === 0) return;
    setProcessing(true);
    setError(null);
    try {
      let result: ChatGPTLoreProgress;
      do {
        result = await processChatGPTExport(sourceFileId, {
          conversationIds: effectiveSelectedIds,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          titleQuery: titleQuery.trim() || undefined,
          includeSensitive,
          batchSize: 10,
        });
        setProgress(result);
      } while (!result.completed);
      setReminder((current) => current ? {
        ...current,
        status: 'imported',
        sourceFileId,
        remindAt: null,
        shouldRemind: false,
        completedAt: new Date().toISOString(),
      } : current);

      if (deleteAfterImport) {
        await deleteChatGPTExportSource(sourceFileId);
        setSourceDeleted(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import paused. You can safely resume it.');
    } finally {
      setProcessing(false);
    }
  };

  const categoryEntries = Object.entries(progress?.profilePreview.categoryCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);

  return (
    <div className="space-y-4" data-testid="chatgpt-lore-migration">
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-sm font-medium text-white">Private, review-first migration</p>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              LoreBook treats your messages as evidence, excludes assistant claims from canon,
              detects likely hypotheticals, and sends every proposed memory to review.
            </p>
          </div>
        </div>
      </div>

      {!inventory && (
        <>
        {reminder?.status === 'requested' && (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-4">
            <p className="text-sm font-medium text-white">Waiting for your OpenAI export</p>
            <p className="mt-1 text-xs text-white/45">
              You can leave this page and keep using Lore Book. We’ll remind you again
              {reminder.remindAt ? ` around ${new Date(reminder.remindAt).toLocaleDateString()}` : ' later'}.
            </p>
          </div>
        )}
        {(!reminder || ['not_requested', 'dismissed'].includes(reminder.status)) && (
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <p className="text-sm font-medium text-white/80">Don’t have the export yet?</p>
            <p className="mt-1 text-xs text-white/40">
              Request it from ChatGPT’s Data Controls, then tell Lore Book to remind you. You do not need to keep this page open.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="https://chatgpt.com/#settings/DataControls"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/12 px-3 py-2 text-xs text-white/65 hover:bg-white/[0.06]"
              >
                Open ChatGPT Data Controls
              </a>
              <button
                type="button"
                disabled={reminderSaving}
                onClick={() => void scheduleReminder()}
                className="rounded-lg bg-primary/15 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
              >
                {reminderSaving ? 'Saving reminder…' : 'I requested it — remind me'}
              </button>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
          <FileArchive className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-3 text-sm font-medium text-white/80">Upload your ChatGPT data export</p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-white/40">
            Choose the ZIP from OpenAI, a conversations.json file, or numbered conversation JSON files packaged in the ZIP.
          </p>
          <input
            ref={inputRef}
            data-testid="chatgpt-export-file"
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={analyzing}
            onClick={() => inputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {analyzing ? 'Reading export…' : 'Choose ChatGPT export'}
          </button>
        </div>
        </>
      )}

      {inventory && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Conversations', inventory.conversationCount],
              ['Your messages', inventory.userMessageCount],
              ['Assistant excluded', inventory.assistantMessageCount],
              ['Selected', selectedIds.size],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
                <p className="text-[11px] text-white/35">{label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border border-white/10 bg-black/25 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-white/45">
                Search conversation titles
                <input
                  value={titleQuery}
                  onChange={(event) => setTitleQuery(event.target.value)}
                  placeholder="Projects, relationships…"
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-primary/50 focus:outline-none"
                />
              </label>
              <label className="text-xs text-white/45">
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-primary/50 focus:outline-none"
                />
              </label>
              <label className="text-xs text-white/45">
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-primary/50 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = new Set(selectedIds);
                  filtered.forEach((conversation) => next.add(conversation.id));
                  setSelectedIds(next);
                }}
                className="text-xs text-primary hover:text-primary/80"
              >
                Select filtered ({filtered.length})
              </button>
              <span className="text-white/20">·</span>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(selectedIds);
                  filtered.forEach((conversation) => next.delete(conversation.id));
                  setSelectedIds(next);
                }}
                className="text-xs text-white/45 hover:text-white/70"
              >
                Clear filtered
              </button>
              <span className="w-full sm:w-auto sm:ml-auto text-[11px] text-white/35">{selectedFilteredCount} filtered selected</span>
            </div>

            <button
              type="button"
              onClick={() => setShowConversations((value) => !value)}
              className="flex w-full items-center justify-between border-t border-white/8 pt-3 text-left text-xs text-white/55 hover:text-white/80"
            >
              Review individual conversations
              {showConversations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showConversations && (
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {filtered.map((conversation) => (
                  <label
                    key={conversation.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(conversation.id)}
                      onChange={() => {
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (next.has(conversation.id)) next.delete(conversation.id);
                          else next.add(conversation.id);
                          return next;
                        });
                      }}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white/75">{conversation.title}</span>
                      <span className="block truncate text-[11px] text-white/35">
                        {conversation.userMessageCount} of your messages · {conversation.preview}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-4">
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm text-white/70">Include potentially sensitive claims</span>
                <span className="block text-xs text-white/35">Health, sexuality, finances, politics, religion, trauma, and legal topics.</span>
              </span>
              <input
                type="checkbox"
                checked={includeSensitive}
                onChange={(event) => setIncludeSensitive(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
            </label>
            <label className="flex items-start justify-between gap-4 border-t border-white/8 pt-3">
              <span>
                <span className="block text-sm text-white/70">Delete source archive after extraction</span>
                <span className="block text-xs text-white/35">Recommended. Evidence excerpts and provenance IDs remain for review.</span>
              </span>
              <input
                type="checkbox"
                checked={deleteAfterImport}
                onChange={(event) => setDeleteAfterImport(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void startImport()}
            disabled={processing || effectiveSelectedIds.length === 0 || progress?.completed}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {processing
              ? `Building profile proposals… ${progress?.progress ?? 0}%`
              : progress?.completed
                ? 'Extraction complete'
                : `Create review proposals from ${effectiveSelectedIds.length} conversations`}
          </button>

          {progress && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.05] p-4">
              <div className="flex items-center gap-2">
                {progress.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                <div>
                  <p className="text-sm font-medium text-white">
                    {progress.completed ? 'Your lore proposals are ready' : `Import ${progress.progress}% complete`}
                  </p>
                  <p className="text-xs text-white/40">
                    {progress.stats.proposalsCreated} proposed · {progress.stats.proposalsDeduplicated} merged with existing evidence
                  </p>
                </div>
              </div>

              {categoryEntries.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {categoryEntries.map(([category, count]) => (
                    <div key={category} className="rounded-md border border-white/8 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-white/70">{CATEGORY_LABELS[category] ?? category}</p>
                        <span className="text-xs tabular-nums text-primary">{count}</span>
                      </div>
                      {progress.profilePreview.examples[category]?.[0] && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-white/35">
                          {progress.profilePreview.examples[category][0]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {progress.completed && (
                <button
                  type="button"
                  onClick={onOpenMemoryReview}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/15"
                >
                  Review before adding to LoreBook
                </button>
              )}

              {sourceDeleted && (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-300/70">
                  <Trash2 className="h-3 w-3" />
                  Private source archive deleted after extraction.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
