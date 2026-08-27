import {
  Brain,
  MessageSquare,
  Network,
  Clock,
  Layers,
  TrendingUp,
  Sparkles,
  Users,
  Building2,
  ExternalLink,
  Trash2,
  Pencil,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  projectCharacterClaimForKnowledgeInspector,
  projectCharacterFactForKnowledgeInspector,
  type KernelInspection,
} from '../../api/knowledgeKernel';
import type { CharacterChatMention } from '../../hooks/useCharacterProfileBundle';
import type { Character } from '../../hooks/useLoreNavigatorData';
import { fetchJson } from '../../lib/api';
import { shortDisplayName } from '../../lib/displayName';
import { highlightTextTerms } from '../../lib/highlightTextTerms';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { cachedFetchJson, invalidateCache } from '../../lib/requestCache';
import { buildWhatLoreKnowsClipboardText } from '../../lib/whatLoreKnowsClipboard';
import {
  confirmationDisplayCount,
  partitionCurrentHistoryFacts,
} from '../../lib/whatLoreKnowsFacts';
import { getMockKnowledgeBaseBundle } from '../../mocks/characterIntelligence';
import { KnowledgeInspector } from '../epistemic/KnowledgeInspector';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';
import { InsufficientData } from '../ui/InsufficientData';

export type CharacterKnowledgeBaseData = {
  characterId: string;
  name: string;
  aliases: string[];
  summary: string | null;
  identityMentions: Array<{ mention: string; source: string; evidenceCount: number }>;
  profile: {
    relationshipToUser: string | null;
    memoryCount: number;
    timelineEventCount: number;
    timelineEvents: Array<{ title: string; type: string; date: string | null; summary: string | null }>;
  };
  facts: Array<{
    id: string;
    category: string;
    fact: string;
    confidence?: number;
    status?: string;
    previous_value?: string;
    mention_count?: number;
    first_seen_at?: string | null;
    last_confirmed_at?: string | null;
    updated_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  knowledgeClaims: Array<{
    id: string;
    human_readable_claim: string;
    knowledge_type?: string;
    confidence?: number;
    evidence_count?: number;
    evidence_links?: Array<{ evidence_summary?: string }>;
    last_reinforced_at?: string;
  }>;
  sceneCandidates: Array<{
    id?: string;
    continuity_strength?: number;
    canonical_title?: string;
    recurring_activities?: string[];
  }>;
  relatedEntities: Array<{ id: string; name: string; type: string; relationship?: string }>;
  conversationLinks?: Array<{
    sessionId: string;
    linkKind: string;
    mentionCount: number;
    firstLinkedAt: string;
    sessionTitle?: string;
  }>;
  intelligence: {
    totalEvidenceItems: number;
    lastUpdated: string | null;
    learningScore: number;
  };
};

type CharacterKnowledgeBaseProps = {
  characterId: string;
  characterName: string;
  /** Full character record — richer demo signals when mockMode is on */
  character?: Character | null;
  mockMode?: boolean;
  active?: boolean;
  onAskInChat?: (prompt: string) => void;
  /** Pre-loaded seed (e.g. self profile facts or Character Query knowledge section). */
  initialData?: Partial<CharacterKnowledgeBaseData>;
  /** When true with complete initialData, skip the extra /knowledge-base fetch. */
  skipFetch?: boolean;
  chatMentions?: CharacterChatMention[];
  /** When true, copy addresses the app user in second person (your profile). */
  isSelfProfile?: boolean;
  /** Jump to the exact thread/message a mention came from (closes the modal and navigates). */
  onOpenThread?: (sessionId: string, messageId: string) => void;
};

const catLabel: Record<string, string> = {
  personality: 'Personality',
  appearance: 'Appearance',
  relationship: 'Relationship',
  history: 'History',
  career: 'Career',
  education: 'Education',
  location: 'Location',
  interests: 'Interests',
  health: 'Health',
  goals: 'Goals',
  general: 'General',
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  updated: { label: 'Updated', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  corrected: { label: 'Corrected', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  contradicted: { label: 'Contradicted', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

function formatFactDate(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildMockData(
  characterId: string,
  characterName: string,
  character?: Character | null,
): CharacterKnowledgeBaseData {
  const source = character ?? { id: characterId, name: characterName };
  const bundle = getMockKnowledgeBaseBundle(source);
  const { facts, knowledgeClaims, sceneCandidates } = bundle;
  const timelineCount = bundle.timelineEvents.length;
  return {
    characterId,
    name: characterName,
    aliases: bundle.aliases,
    summary: bundle.summary,
    identityMentions: [{ mention: characterName, source: 'primary_name', evidenceCount: Math.max(3, facts.length) }],
    profile: {
      relationshipToUser: bundle.relationshipToUser,
      memoryCount: Math.max(facts.length + 2, 8),
      timelineEventCount: timelineCount || 3,
      timelineEvents: bundle.timelineEvents,
    },
    facts,
    knowledgeClaims,
    sceneCandidates: sceneCandidates as unknown as Array<Record<string, unknown>>,
    relatedEntities: bundle.relatedEntities,
    conversationLinks: bundle.conversationLinks,
    intelligence: {
      totalEvidenceItems: facts.length + knowledgeClaims.length + sceneCandidates.length + timelineCount,
      lastUpdated: new Date().toISOString(),
      learningScore: Math.min(100, facts.length * 8 + knowledgeClaims.length * 12 + timelineCount * 4),
    },
  };
}

function resolveInitialData(
  characterId: string,
  characterName: string,
  mockMode: boolean,
  initialData?: Partial<CharacterKnowledgeBaseData>,
  character?: Character | null,
): CharacterKnowledgeBaseData | null {
  if (initialData) {
    return {
      characterId,
      name: characterName,
      aliases: [],
      summary: null,
      identityMentions: [],
      profile: { relationshipToUser: null, memoryCount: 0, timelineEventCount: 0, timelineEvents: [] },
      facts: [],
      knowledgeClaims: [],
      sceneCandidates: [],
      relatedEntities: [],
      intelligence: { totalEvidenceItems: 0, lastUpdated: null, learningScore: 0 },
      ...initialData,
    } as CharacterKnowledgeBaseData;
  }
  if (mockMode) {
    return buildMockData(characterId, characterName, character);
  }
  return null;
}

// The knowledge base is fetched on every modal mount, and the modal now opens
// from anywhere (GlobalEntityModalHost). Cache + dedupe via the shared request
// cache so reopening the same character reuses the last response. Short TTL so
// freshly-ingested facts still surface quickly.
const KB_CACHE_TTL_MS = 2 * 60 * 1000;

type ChatMentionThreadGroup = {
  sessionId: string;
  sessionTitle: string;
  mentions: CharacterChatMention[];
  latestAt: number;
};

function groupChatMentionsByThread(mentions: CharacterChatMention[]): ChatMentionThreadGroup[] {
  const bySession = new Map<string, CharacterChatMention[]>();
  for (const m of mentions) {
    const list = bySession.get(m.sessionId) ?? [];
    list.push(m);
    bySession.set(m.sessionId, list);
  }
  return [...bySession.entries()]
    .map(([sessionId, rows]) => {
      const sorted = [...rows].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return {
        sessionId,
        sessionTitle: sorted[0]?.sessionTitle?.trim() || 'Conversation',
        mentions: sorted,
        latestAt: new Date(sorted[0]?.createdAt ?? 0).getTime(),
      };
    })
    .sort((a, b) => b.latestAt - a.latestAt);
}

function collectMentionHighlightTerms(input: {
  characterName: string;
  aliases?: string[];
  identityMentions?: Array<{ mention: string }>;
  chatMentions?: CharacterChatMention[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw?: string | null) => {
    const t = raw?.trim();
    if (!t || t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  push(input.characterName);
  // First token helps when messages say "Leslie" but the card is "Cousin Leslie".
  const first = input.characterName.trim().split(/\s+/)[0];
  if (first && first.length >= 2 && first.toLowerCase() !== input.characterName.trim().toLowerCase()) {
    push(first);
  }
  for (const a of input.aliases ?? []) push(a);
  for (const m of input.identityMentions ?? []) push(m.mention);
  for (const m of input.chatMentions ?? []) push(m.matchedName);
  return out.sort((a, b) => b.length - a.length);
}

function ChatMentionsByThread({
  mentions,
  onOpenThread,
  highlightTerms,
}: {
  mentions: CharacterChatMention[];
  onOpenThread?: (sessionId: string, messageId: string) => void;
  highlightTerms: string[];
}) {
  const groups = useMemo(() => groupChatMentionsByThread(mentions), [mentions]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const defaultOpenId = groups[0]?.sessionId;

  const renderContent = (content: string) =>
    highlightTerms.length > 0
      ? highlightTextTerms(content, highlightTerms, {
          className:
            'rounded-sm bg-amber-400/30 text-amber-50 px-0.5 font-medium ring-1 ring-amber-400/45',
          markTestId: 'chat-mention-name-highlight',
        })
      : content;

  return (
    <div className="space-y-3" data-testid="chat-mentions-by-thread">
      <p className="text-[11px] text-white/40">
        {mentions.length} mention{mentions.length === 1 ? '' : 's'} across {groups.length}{' '}
        conversation{groups.length === 1 ? '' : 's'}
      </p>
      {groups.map((group) => {
        const isOpen =
          collapsed[group.sessionId] === true
            ? false
            : collapsed[group.sessionId] === false
              ? true
              : group.sessionId === defaultOpenId;
        return (
          <div
            key={group.sessionId}
            className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden"
            data-testid={`chat-mention-thread-${group.sessionId}`}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [group.sessionId]: isOpen }))
              }
              aria-expanded={isOpen}
            >
              <div className="min-w-0">
                <p className="text-sm text-white/90 font-medium truncate">{group.sessionTitle}</p>
                <p className="text-[11px] text-white/40">
                  {group.mentions.length} mention{group.mentions.length === 1 ? '' : 's'}
                  {group.latestAt
                    ? ` · last ${new Date(group.latestAt).toLocaleDateString()}`
                    : ''}
                </p>
              </div>
              <span className="text-[11px] text-white/35 flex-shrink-0">{isOpen ? 'Hide' : 'Show'}</span>
            </button>
            {isOpen && (
              <div className="space-y-2 px-2 pb-2">
                {group.mentions.map((mention) =>
                  onOpenThread ? (
                    <button
                      key={mention.messageId}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenThread(mention.sessionId, mention.messageId);
                      }}
                      className="w-full text-left rounded-lg border border-sky-500/25 bg-sky-950/20 p-3 hover:bg-sky-950/35 hover:border-sky-400/50 transition-colors group cursor-pointer"
                      data-testid={`chat-mention-${mention.messageId}`}
                      aria-label={`Open conversation and jump to this mention from ${new Date(mention.createdAt).toLocaleString()}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-white/85 leading-snug whitespace-pre-wrap">
                          {renderContent(mention.content)}
                        </p>
                        <ExternalLink
                          className="h-3.5 w-3.5 text-sky-400/70 group-hover:text-sky-300 flex-shrink-0 mt-0.5"
                          aria-hidden
                        />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        <span className="text-white/40">
                          {new Date(mention.createdAt).toLocaleString()}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 font-medium text-sky-200 group-hover:bg-sky-500/25 group-hover:text-white"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          Open this conversation
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div
                      key={mention.messageId}
                      className="rounded-lg border border-white/8 bg-white/[0.03] p-3"
                      data-testid={`chat-mention-${mention.messageId}`}
                    >
                      <p className="text-sm text-white/85 leading-snug whitespace-pre-wrap">
                        {renderContent(mention.content)}
                      </p>
                      <p className="mt-2 text-[11px] text-white/40">
                        {new Date(mention.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CharacterKnowledgeBase({
  characterId,
  characterName,
  character,
  mockMode = false,
  active = true,
  onAskInChat,
  initialData,
  skipFetch = false,
  chatMentions = [],
  isSelfProfile = false,
  onOpenThread,
}: CharacterKnowledgeBaseProps) {
  const [data, setData] = useState<CharacterKnowledgeBaseData | null>(() =>
    resolveInitialData(characterId, characterName, mockMode, initialData, character),
  );
  // Seed can render immediately; still fetch full KB unless mockMode or skipFetch.
  const [loading, setLoading] = useState(!(mockMode || (skipFetch && Boolean(initialData))));
  const [loaded, setLoaded] = useState(Boolean(mockMode || (skipFetch && Boolean(initialData))));
  /** Two-step remove: first click arms a fact; second click confirms. */
  const [pendingRemoveFactId, setPendingRemoveFactId] = useState<string | null>(null);
  const [removingFactId, setRemovingFactId] = useState<string | null>(null);
  const [factActionError, setFactActionError] = useState<string | null>(null);
  /** Edit mode: draft must be saved explicitly — typing alone does not persist. */
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingFactId, setSavingFactId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<KernelInspection | null>(null);
  const copyAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!initialData || mockMode) return;
    setData((prev) => ({ ...(prev ?? ({} as CharacterKnowledgeBaseData)), ...initialData } as CharacterKnowledgeBaseData));
    if (skipFetch) {
      setLoading(false);
      setLoaded(true);
    }
  }, [initialData, mockMode, skipFetch]);

  useEffect(() => {
    if (mockMode) {
      setData(buildMockData(characterId, characterName, character));
      setLoaded(true);
      setLoading(false);
      return;
    }

    if (skipFetch) {
      setLoaded(true);
      setLoading(false);
      return;
    }

    if (!active || loaded) return;

    if (!characterId || characterId.startsWith('dummy-') || characterId.startsWith('char-')) {
      setLoaded(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    cachedFetchJson<{ success: boolean; knowledgeBase: CharacterKnowledgeBaseData }>(
      `/api/characters/${characterId}/knowledge-base`,
      { ttlMs: KB_CACHE_TTL_MS }
    )
      .then((r) => {
        if (r.success && r.knowledgeBase) setData(r.knowledgeBase);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setLoaded(true);
      });
  }, [active, loaded, mockMode, characterId, characterName, character, skipFetch]);

  const beginEditFact = (fact: { id: string; fact: string }) => {
    setFactActionError(null);
    setPendingRemoveFactId(null);
    setEditingFactId(fact.id);
    setEditDraft(fact.fact);
  };

  const cancelEditFact = () => {
    setEditingFactId(null);
    setEditDraft('');
    setFactActionError(null);
  };

  const confirmSaveFactEdit = async (factId: string) => {
    if (savingFactId || removingFactId) return;
    const next = editDraft.replace(/\s+/g, ' ').trim();
    if (!next) {
      setFactActionError('Enter a corrected fact before saving.');
      return;
    }
    setFactActionError(null);
    setSavingFactId(factId);
    try {
      let updated: { id: string; fact: string; status?: string; previous_value?: string; confidence?: number } | null =
        null;
      if (!mockMode) {
        const res = await fetchJson<{
          success: boolean;
          fact: { id: string; fact: string; status?: string; previous_value?: string; confidence?: number };
        }>(`/api/characters/${characterId}/facts/${factId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fact: next }),
        });
        updated = res.fact;
        invalidateCache(`/api/characters/${characterId}/knowledge-base`);
        invalidateCache(`/api/characters/${characterId}/facts`);
      } else {
        updated = {
          id: factId,
          fact: next,
          status: 'corrected',
          previous_value: data?.facts.find((f) => f.id === factId)?.fact,
          confidence: 0.95,
        };
      }
      if (updated) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            facts: prev.facts.map((f) =>
              f.id === factId
                ? {
                    ...f,
                    fact: updated!.fact,
                    status: updated!.status ?? 'corrected',
                    previous_value: updated!.previous_value ?? f.fact,
                    confidence: updated!.confidence ?? Math.max(f.confidence ?? 0.7, 0.95),
                  }
                : f,
            ),
          };
        });
      }
      cancelEditFact();
    } catch (error) {
      setFactActionError(error instanceof Error ? error.message : 'Could not save that correction.');
    } finally {
      setSavingFactId(null);
    }
  };

  const confirmRemoveFact = async (factId: string) => {
    if (removingFactId || savingFactId) return;
    setFactActionError(null);
    setRemovingFactId(factId);
    try {
      if (!mockMode) {
        await fetchJson<{ success: boolean }>(`/api/characters/${characterId}/facts/${factId}`, {
          method: 'DELETE',
        });
        invalidateCache(`/api/characters/${characterId}/knowledge-base`);
        invalidateCache(`/api/characters/${characterId}/facts`);
      }
      setData((prev) => {
        if (!prev) return prev;
        const nextFacts = prev.facts.filter((f) => f.id !== factId);
        return {
          ...prev,
          facts: nextFacts,
          intelligence: {
            ...prev.intelligence,
            totalEvidenceItems: Math.max(0, prev.intelligence.totalEvidenceItems - 1),
            learningScore: Math.max(0, prev.intelligence.learningScore - 8),
          },
        };
      });
      setPendingRemoveFactId(null);
    } catch (error) {
      setFactActionError(error instanceof Error ? error.message : 'Could not remove that fact.');
    } finally {
      setRemovingFactId(null);
    }
  };

  const firstName = shortDisplayName(characterName);
  const kb = data;
  const chatMentionHighlightTerms = useMemo(() => {
    const fromCharacter = Array.isArray(character?.alias)
      ? character.alias.filter((a): a is string => typeof a === 'string')
      : [];
    return collectMentionHighlightTerms({
      characterName,
      aliases: [...fromCharacter, ...(kb?.aliases ?? [])],
      identityMentions: kb?.identityMentions,
      chatMentions,
    });
  }, [character?.alias, characterName, chatMentions, kb?.aliases, kb?.identityMentions]);
  const learningScore = kb?.intelligence.learningScore ?? 0;
  const pillOrDash = (n: number) => (loading && !loaded ? '—' : n);
  const headerTitle = isSelfProfile ? 'What Lore Knows About You' : 'Entity Knowledge Base';
  const headerDescription = isSelfProfile
    ? 'Facts, patterns, and connections Lore has collected from your conversations, journal, and resume — your personal knowledge base.'
    : `Everything LoreBook has learned about ${characterName} — facts, patterns, connections, and timeline. Grows as you chat and when duplicate mentions merge into this person.`;

  const clipboardText = useMemo(
    () =>
      buildWhatLoreKnowsClipboardText({
        title: headerTitle,
        characterName,
        learningScore,
        lastUpdated: kb?.intelligence.lastUpdated ?? null,
        knowledgeBase: kb,
        chatMentions,
      }),
    [headerTitle, characterName, learningScore, kb, chatMentions],
  );

  const hasClipboardContent = Boolean(
    (kb?.facts.length ?? 0) > 0 ||
      (kb?.knowledgeClaims.length ?? 0) > 0 ||
      (kb?.profile.timelineEvents.length ?? 0) > 0 ||
      (kb?.relatedEntities.length ?? 0) > 0 ||
      (kb?.aliases.length ?? 0) > 0 ||
      (kb?.summary?.trim() ?? '') ||
      chatMentions.length > 0,
  );

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(clipboardText);
    if (!ok) return;
    setCopiedAll(true);
    if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
    copyAllTimerRef.current = setTimeout(() => setCopiedAll(false), 2000);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 sm:space-y-6">
      {/* Entity Knowledge Base header */}
      <Card className="min-w-0 border border-violet-500/25 bg-gradient-to-br from-violet-950/30 via-black/60 to-indigo-950/20 shadow-lg sm:border-2 sm:shadow-xl">
        <CardHeader className="px-3 py-2 pb-2 sm:px-6 sm:py-4 sm:pb-3">
          {/* Mobile: compact single-block header */}
          <div className="sm:hidden space-y-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-500/20 p-1.5">
                  <Brain className="h-3.5 w-3.5 text-violet-300" />
                </div>
                <h2 className="min-w-0 truncate text-sm font-semibold leading-tight text-white">
                  {isSelfProfile ? 'What Lore Knows' : headerTitle}
                </h2>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyAll()}
                  disabled={!hasClipboardContent}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-40 ${
                    copiedAll
                      ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                      : 'border-white/10 text-white/55 hover:text-white hover:border-white/25'
                  }`}
                  title="Copy all What Lore Knows as plain text"
                  aria-label="Copy all What Lore Knows"
                  data-testid="what-lore-knows-copy-all"
                >
                  {copiedAll ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedAll ? 'Copied' : 'Copy'}
                </button>
                <div className="text-right leading-none">
                  <span className="text-base font-bold tabular-nums text-white">{learningScore}</span>
                  <span className="text-[10px] text-white/40">/100</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <StatPill icon={Brain} label="Facts" value={pillOrDash(kb?.facts.length ?? 0)} compact />
              <StatPill icon={Layers} label="Patterns" value={pillOrDash(kb?.knowledgeClaims.length ?? 0)} compact />
              <StatPill icon={Clock} label="Time" value={pillOrDash(kb?.profile.timelineEventCount ?? 0)} compact />
              <StatPill
                icon={MessageSquare}
                label="Chat"
                value={pillOrDash(chatMentions.length)}
                compact
              />
            </div>
          </div>

          {/* Desktop: full header */}
          <div className="hidden sm:flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 rounded-xl border border-violet-500/40 bg-violet-500/20 p-2.5">
                <Brain className="h-6 w-6 text-violet-300" />
              </div>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-white">
                  {headerTitle}
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
                </h2>
                <p className="mt-1 max-w-xl text-sm text-white/55">{headerDescription}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                disabled={!hasClipboardContent}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  copiedAll
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                    : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
                }`}
                title="Copy all What Lore Knows as plain text"
                aria-label="Copy all What Lore Knows"
                data-testid="what-lore-knows-copy-all-desktop"
              >
                {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedAll ? 'Copied' : 'Copy all'}
              </button>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 shrink-0 text-green-400" />
                <span className="text-2xl font-bold tabular-nums text-white">{learningScore}</span>
                <span className="text-xs text-white/40">/100 learning</span>
              </div>
              {kb?.intelligence.lastUpdated && (
                <p className="text-[10px] text-white/30">
                  Updated {new Date(kb.intelligence.lastUpdated).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 sm:px-6">
          <div className="mb-0 hidden grid-cols-2 gap-2 sm:mb-0 sm:grid sm:grid-cols-4">
            <StatPill icon={Brain} label="Facts" value={pillOrDash(kb?.facts.length ?? 0)} />
            <StatPill icon={Layers} label="Patterns" value={pillOrDash(kb?.knowledgeClaims.length ?? 0)} />
            <StatPill icon={Clock} label="Timeline" value={pillOrDash(kb?.profile.timelineEventCount ?? 0)} />
            <StatPill icon={MessageSquare} label="Chat" value={pillOrDash(chatMentions.length)} />
          </div>

          {(kb?.aliases.length ?? 0) > 0 || (kb?.identityMentions.length ?? 0) > 1 ? (
            <div className="mt-3 border-t border-white/8 pt-3 sm:mt-4 sm:pt-4">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                Known as / merged mentions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {kb?.aliases.map((alias) => (
                  <Badge key={alias} className="bg-white/5 text-white/70 border-white/15 text-xs">
                    {alias}
                  </Badge>
                ))}
                {kb?.identityMentions
                  .filter((m) => m.mention.toLowerCase() !== characterName.toLowerCase())
                  .slice(0, 8)
                  .map((m) => (
                    <Badge
                      key={`${m.mention}-${m.source}`}
                      className="bg-violet-500/10 text-violet-200 border-violet-500/25 text-xs"
                    >
                      {m.mention}
                      <span className="ml-1 text-white/30">×{m.evidenceCount}</span>
                    </Badge>
                  ))}
              </div>
            </div>
          ) : null}

          {(kb?.relatedEntities.length ?? 0) > 0 && (
            <div className="mt-4 pt-4 border-t border-white/8">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Network className="h-3 w-3" />
                Connected entities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {kb!.relatedEntities.slice(0, 12).map((entity) => (
                  <Badge
                    key={`${entity.type}-${entity.id}`}
                    className="bg-cyan-500/10 text-cyan-200 border-cyan-500/20 text-xs"
                  >
                    {entity.type === 'organization' ? (
                      <Building2 className="h-3 w-3 inline mr-1" />
                    ) : (
                      <Users className="h-3 w-3 inline mr-1" />
                    )}
                    {entity.name}
                    {entity.relationship ? (
                      <span className="ml-1 text-white/35">· {entity.relationship}</span>
                    ) : null}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {kb?.profile.relationshipToUser && !isSelfProfile && (
            <p className="mt-3 text-xs text-white/50">
              Relationship to you: <span className="text-white/80">{kb.profile.relationshipToUser}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Origin & linked conversations */}
      {(kb?.conversationLinks?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={MessageSquare}
            iconClass="text-primary"
            title="Conversations"
            subtitle={
              isSelfProfile
                ? 'Chat threads where you shared details about your life.'
                : 'Chat threads where this person was mentioned — including the first conversation that introduced them.'
            }
          />
          <div className="space-y-2">
            {kb!.conversationLinks!.map((link) => (
              <Link
                key={link.sessionId}
                to={`/chat/${link.sessionId}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/90 font-medium truncate">
                    {link.sessionTitle ?? 'Conversation'}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    {link.linkKind === 'origin' ? 'First mentioned here' : 'Also discussed here'}
                    {' · '}
                    {new Date(link.firstLinkedAt).toLocaleDateString()}
                    {link.mentionCount > 1 ? ` · ${link.mentionCount} mentions` : ''}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-primary/60 group-hover:text-primary flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Facts */}
      <section className="space-y-3">
        <SectionHeader
          icon={Brain}
          iconClass="text-violet-400"
          title={isSelfProfile ? 'Facts About You' : 'Facts From Conversations'}
          subtitle={
            isSelfProfile
              ? 'Extracted from your chats and uploads — updated as you share more.'
              : 'Extracted directly from chats — updated as new information comes in.'
          }
        />
        {!kb?.facts.length ? (
          <InsufficientData
            compact
            icon={Brain}
            accent="violet"
            title={isSelfProfile ? 'No facts about you yet' : `No facts about ${firstName} yet`}
            description={
              isSelfProfile
                ? 'Facts are pulled from what you tell Lore. Keep chatting or upload a resume and they will appear here.'
                : `Facts are pulled straight from your conversations. Chat about ${firstName} and they'll start appearing here.`
            }
            action={
              onAskInChat
                ? {
                    label: 'Start a chat',
                    icon: MessageSquare,
                    onClick: () =>
                      onAskInChat(
                        isSelfProfile
                          ? 'Help me add more to my personal profile: '
                          : `Let me tell you about ${characterName}: `,
                      ),
                  }
                : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {factActionError && (
              <p className="text-xs text-red-300/90 px-1" role="alert">
                {factActionError}
              </p>
            )}
            {Object.entries(
              kb.facts.reduce((acc: Record<string, typeof kb.facts>, f) => {
                if (!acc[f.category]) acc[f.category] = [];
                acc[f.category].push(f);
                return acc;
              }, {})
            ).map(([category, facts]) => {
              const { current, history } = partitionCurrentHistoryFacts(facts);
              const ordered = [...current, ...history];
              return (
              <div key={category}>
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                  {catLabel[category] ?? category}
                </p>
                <div className="space-y-2">
                  {current.length > 0 && (
                    <p className="text-[9px] font-semibold text-emerald-300/45 uppercase tracking-wider">
                      Current
                    </p>
                  )}
                  {ordered.map((fact) => {
                    const pct = Math.round((fact.confidence ?? 0.7) * 100);
                    const badge = statusBadge[fact.status as string];
                    const confirming = pendingRemoveFactId === fact.id;
                    const editing = editingFactId === fact.id;
                    const busyRemove = removingFactId === fact.id;
                    const busySave = savingFactId === fact.id;
                    const actionsLocked = Boolean(removingFactId || savingFactId);
                    const isHist = history.some((h) => h.id === fact.id);
                    const showHistoryLabel =
                      isHist && fact.id === history[0]?.id && current.length > 0;
                    return (
                      <Fragment key={fact.id}>
                      {showHistoryLabel && (
                        <p className="text-[9px] font-semibold text-white/25 uppercase tracking-wider pt-1">
                          History
                        </p>
                      )}
                      {isHist && fact.id === history[0]?.id && current.length === 0 && (
                        <p className="text-[9px] font-semibold text-white/25 uppercase tracking-wider">
                          History
                        </p>
                      )}
                      <div
                        className={`flex items-start gap-2.5 p-3 rounded-lg border bg-white/3 ${
                          confirming
                            ? 'border-red-500/35 bg-red-950/20'
                            : editing
                              ? 'border-amber-500/35 bg-amber-950/15'
                              : isHist
                                ? 'border-white/5 opacity-75'
                                : 'border-white/6'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          {editing ? (
                            <div className="space-y-2">
                              <label className="sr-only" htmlFor={`edit-fact-${fact.id}`}>
                                Corrected fact
                              </label>
                              <textarea
                                id={`edit-fact-${fact.id}`}
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                maxLength={500}
                                disabled={busySave}
                                placeholder="e.g. Had pink hair in the past"
                                className="w-full rounded-lg border border-amber-500/30 bg-black/50 px-3 py-2 text-sm text-white/90 placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none resize-y min-h-[72px]"
                                data-testid={`edit-fact-input-${fact.id}`}
                              />
                              <p className="text-[11px] text-amber-100/70">
                                Lore will remember this correction and keep the old wording as history.
                                Saving is required — edits are not applied until you confirm.
                              </p>
                            </div>
                          ) : (
                            <>
                              <p className={`text-sm leading-snug ${isHist ? 'text-white/65' : 'text-white/85'}`}>
                                {fact.fact}
                              </p>
                              {fact.previous_value && (
                                <p className="text-[11px] text-white/35 mt-1 line-through">
                                  {fact.previous_value}
                                </p>
                              )}
                              {(() => {
                                const firstSeen = formatFactDate(fact.first_seen_at);
                                const lastConfirmed = formatFactDate(
                                  fact.last_confirmed_at || fact.updated_at,
                                );
                                const mentions = confirmationDisplayCount(fact);
                                if (!firstSeen && !lastConfirmed && mentions < 2) return null;
                                return (
                                  <p className="text-[10px] text-white/35 mt-1.5 tabular-nums">
                                    {firstSeen ? `First noted ${firstSeen}` : null}
                                    {firstSeen && lastConfirmed && lastConfirmed !== firstSeen
                                      ? ' · '
                                      : null}
                                    {lastConfirmed && lastConfirmed !== firstSeen
                                      ? `Confirmed ${lastConfirmed}`
                                      : firstSeen && lastConfirmed === firstSeen
                                        ? null
                                        : lastConfirmed
                                          ? `Confirmed ${lastConfirmed}`
                                          : null}
                                    {mentions >= 2
                                      ? `${firstSeen || lastConfirmed ? ' · ' : ''}${mentions}× confirmed`
                                      : null}
                                  </p>
                                );
                              })()}
                            </>
                          )}
                          {confirming && !editing && (
                            <p className="text-[11px] text-red-200/80 mt-2">
                              Remove this fact from What Lore Knows? This won&apos;t delete your chats.
                              If it was true before, edit it instead (e.g. past tense).
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {badge && !editing && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          )}
                          {!editing && (
                            <span
                              className={`text-[10px] tabular-nums font-semibold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}
                            >
                              {pct}%
                            </span>
                          )}
                          {!editing && (
                            <button
                              type="button"
                              onClick={() => setSelectedInspection(projectCharacterFactForKnowledgeInspector({
                                characterId,
                                characterName,
                                fact,
                              }))}
                              className="inline-flex items-center gap-1 rounded border border-violet-400/20 bg-violet-400/5 px-1.5 py-1 text-[10px] text-violet-200/70 hover:border-violet-400/40 hover:bg-violet-400/10 hover:text-violet-100"
                              aria-label={`Why LoreBook shows this fact about ${characterName}`}
                            >
                              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                              Why?
                            </button>
                          )}
                          {isSelfProfile && (
                            editing ? (
                              <div className="flex flex-col items-stretch gap-1.5 mt-0.5 min-w-[7.5rem]">
                                <button
                                  type="button"
                                  disabled={busySave || !editDraft.trim()}
                                  onClick={() => void confirmSaveFactEdit(fact.id)}
                                  className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/50 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
                                  data-testid={`confirm-save-fact-${fact.id}`}
                                >
                                  {busySave ? 'Saving…' : 'Save correction'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busySave}
                                  onClick={cancelEditFact}
                                  className="text-[10px] px-2 py-1 rounded border border-white/15 text-white/60 hover:bg-white/5 disabled:opacity-50"
                                  data-testid={`cancel-edit-fact-${fact.id}`}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : confirming ? (
                              <div className="flex flex-col items-stretch gap-1.5 mt-0.5 min-w-[7.5rem]">
                                <button
                                  type="button"
                                  disabled={busyRemove}
                                  onClick={() => void confirmRemoveFact(fact.id)}
                                  className="text-[10px] font-semibold px-2 py-1 rounded border border-red-400/50 bg-red-500/20 text-red-100 hover:bg-red-500/30 disabled:opacity-50"
                                  data-testid={`confirm-remove-fact-${fact.id}`}
                                >
                                  {busyRemove ? 'Removing…' : 'Confirm remove'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyRemove}
                                  onClick={() => beginEditFact(fact)}
                                  className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
                                  data-testid={`edit-instead-fact-${fact.id}`}
                                >
                                  Edit instead
                                </button>
                                <button
                                  type="button"
                                  disabled={busyRemove}
                                  onClick={() => {
                                    setPendingRemoveFactId(null);
                                    setFactActionError(null);
                                  }}
                                  className="text-[10px] px-2 py-1 rounded border border-white/15 text-white/60 hover:bg-white/5 disabled:opacity-50"
                                  data-testid={`cancel-remove-fact-${fact.id}`}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 mt-0.5">
                                <button
                                  type="button"
                                  disabled={actionsLocked}
                                  onClick={() => beginEditFact(fact)}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border border-white/10 text-white/40 hover:text-amber-100 hover:border-amber-400/40 hover:bg-amber-500/10 disabled:opacity-50"
                                  aria-label="Edit fact"
                                  data-testid={`arm-edit-fact-${fact.id}`}
                                >
                                  <Pencil className="h-3 w-3" aria-hidden="true" />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={actionsLocked}
                                  onClick={() => {
                                    setFactActionError(null);
                                    setEditingFactId(null);
                                    setPendingRemoveFactId(fact.id);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border border-white/10 text-white/40 hover:text-red-200 hover:border-red-400/40 hover:bg-red-500/10 disabled:opacity-50"
                                  aria-label="Remove fact"
                                  data-testid={`arm-remove-fact-${fact.id}`}
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                                  Remove
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Chat evidence */}
      <section className="space-y-3">
        <SectionHeader
          icon={MessageSquare}
          iconClass="text-sky-400"
          title="From your chats"
          subtitle="Every conversation where they showed up — jump to the exact line."
        />
        {chatMentions.length === 0 ? (
          <InsufficientData
            icon={MessageSquare}
            accent="sky"
            title="No chat mentions yet"
            description={
              isSelfProfile
                ? 'Talk to Lore about yourself to build this section.'
                : `Open chat with ${firstName}'s chip attached and tell Lore about them — corrections update this profile too.`
            }
            action={
              onAskInChat
                ? {
                    label: 'Correct in chat',
                    icon: MessageSquare,
                    onClick: () =>
                      onAskInChat(
                        `Correction about ${characterName}: actually `,
                      ),
                  }
                : undefined
            }
          />
        ) : (
          <ChatMentionsByThread
            mentions={chatMentions}
            onOpenThread={onOpenThread}
            highlightTerms={chatMentionHighlightTerms}
          />
        )}
      </section>

      {/* Crystallized knowledge */}
      <section className="space-y-3">
        <SectionHeader
          icon={Brain}
          iconClass="text-indigo-400"
          title="Crystallized Knowledge"
          subtitle="Patterns crystallized from your entries, arcs, and interactions."
        />
        {!kb?.knowledgeClaims.length ? (
          <InsufficientData
            icon={Brain}
            accent="indigo"
            title="No crystallized knowledge yet"
            description={
              isSelfProfile
                ? 'Patterns form once Lore sees the same themes across your entries and conversations.'
                : `Knowledge claims form once a pattern shows up repeatedly across your entries about ${firstName}.`
            }
          />
        ) : (
          <div className="space-y-3">
            {kb.knowledgeClaims.map((claim) => {
              const pct = Math.round((claim.confidence ?? 0) * 100);
              const confColor =
                pct >= 75 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-orange-400';
              const evidenceCount = claim.evidence_count ?? claim.evidence_links?.length ?? 0;
              return (
                <div
                  key={claim.id}
                  className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/15 space-y-3"
                >
                  <p className="text-sm text-white/90 leading-relaxed">{claim.human_readable_claim}</p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold tabular-nums ${confColor}`}>{pct}%</span>
                    </div>
                    {evidenceCount > 0 && (
                      <span className="text-xs text-white/35">
                        {evidenceCount} evidence item{evidenceCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {claim.knowledge_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/25 text-indigo-300/70 bg-indigo-950/30">
                        {claim.knowledge_type.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {claim.evidence_links && claim.evidence_links.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-white/8">
                      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                        Supporting evidence
                      </p>
                      {claim.evidence_links.slice(0, 3).map((link, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-indigo-400/40 flex-shrink-0 mt-1.5" />
                          <p className="text-xs text-white/55 leading-snug">{link.evidence_summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedInspection(projectCharacterClaimForKnowledgeInspector({
                      characterId,
                      characterName,
                      claim,
                    }))}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-400/25 bg-indigo-400/5 px-3 text-xs font-medium text-indigo-200/80 hover:border-indigo-400/45 hover:bg-indigo-400/10 hover:text-indigo-100"
                    aria-label={`Why LoreBook suggests this pattern about ${characterName}`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Why does LoreBook show this?
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Timeline preview */}
      {(kb?.profile.timelineEvents.length ?? 0) > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={Clock}
            iconClass="text-cyan-400"
            title="Timeline Highlights"
            subtitle="Key events in this person's story arc."
          />
          <div className="space-y-2">
            {kb!.profile.timelineEvents.slice(0, 6).map((ev, i) => (
              <div key={i} className="p-3 rounded-lg border border-cyan-500/15 bg-cyan-950/10">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white/85 font-medium">{ev.title}</p>
                  <span className="text-[10px] text-white/35 flex-shrink-0">
                    {ev.date ? new Date(ev.date).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
                {ev.summary && <p className="text-xs text-white/45 mt-1">{ev.summary.slice(0, 160)}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recurring moments */}
      {(kb?.sceneCandidates.length ?? 0) > 0 && (
        <section className="space-y-3">
          <SectionHeader
            icon={Sparkles}
            iconClass="text-amber-400"
            title="Recurring Moments"
            subtitle="Patterns LoreBook has noticed across multiple conversations."
          />
          <div className="space-y-2">
            {kb!.sceneCandidates.map((c) => {
              const strength = Math.round((c.continuity_strength ?? 0) * 100);
              return (
                <div
                  key={c.id ?? c.canonical_title ?? c.recurring_activities?.join(':')}
                  className="p-3 rounded-lg border border-amber-500/15 bg-amber-500/5 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white/85 leading-snug font-medium">
                      {c.canonical_title ?? c.recurring_activities?.[0] ?? 'Recurring moment'}
                    </p>
                    <span
                      className={`text-[10px] tabular-nums font-semibold flex-shrink-0 ${strength >= 80 ? 'text-green-400' : strength >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}
                    >
                      {strength}%
                    </span>
                  </div>
                  {c.recurring_activities?.length > 0 && (
                    <p className="text-xs text-white/45 leading-snug">
                      {c.recurring_activities.slice(0, 3).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {selectedInspection ? (
        <KnowledgeInspector
          open
          onClose={() => setSelectedInspection(null)}
          assertion={selectedInspection.assertion}
          evidence={selectedInspection.evidence}
          revisions={selectedInspection.revisions}
          warnings={selectedInspection.warnings}
        />
      ) : null}
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: typeof Brain;
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="rounded-md border border-white/8 bg-black/30 px-1 py-1 text-center">
        <p className="text-sm font-bold tabular-nums leading-none text-white">{value}</p>
        <p className="mt-0.5 truncate text-[8px] uppercase tracking-wide text-white/35">{label}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/8 bg-black/30 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-white/40" />
      <p className="text-lg font-bold tabular-nums text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  iconClass,
  title,
  subtitle,
}: {
  icon: typeof Brain;
  iconClass: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        {title}
      </h3>
      <p className="text-xs text-white/45">{subtitle}</p>
    </div>
  );
}
