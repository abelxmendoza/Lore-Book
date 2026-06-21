import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { InsufficientData } from '../ui/InsufficientData';
import { cachedFetchJson } from '../../lib/requestCache';
import {
  getMockKnowledgeBaseBundle,
} from '../../mocks/characterIntelligence';
import type { Character } from '../../hooks/useLoreNavigatorData';

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
  sceneCandidates: Array<Record<string, unknown>>;
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
  /** Pre-loaded bundle (e.g. self profile) — skips fetch when provided */
  initialData?: Partial<CharacterKnowledgeBaseData>;
  /** When true, copy addresses the app user in second person (your profile). */
  isSelfProfile?: boolean;
};

const catLabel: Record<string, string> = {
  personality: 'Personality',
  appearance: 'Appearance',
  relationship: 'Relationship',
  history: 'History',
  career: 'Career',
  location: 'Location',
  goals: 'Goals',
  general: 'General',
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  updated: { label: 'Updated', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  corrected: { label: 'Corrected', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  contradicted: { label: 'Contradicted', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

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

export function CharacterKnowledgeBase({
  characterId,
  characterName,
  character,
  mockMode = false,
  active = true,
  onAskInChat,
  initialData,
  isSelfProfile = false,
}: CharacterKnowledgeBaseProps) {
  const [data, setData] = useState<CharacterKnowledgeBaseData | null>(() =>
    resolveInitialData(characterId, characterName, mockMode, initialData, character),
  );
  const [loading, setLoading] = useState(!initialData && !mockMode);
  const [loaded, setLoaded] = useState(Boolean(initialData || mockMode));

  useEffect(() => {
    if (mockMode) {
      setData(buildMockData(characterId, characterName, character));
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
  }, [active, loaded, mockMode, characterId, characterName, character]);

  const firstName = characterName.split(' ')[0];
  const kb = data;
  const learningScore = kb?.intelligence.learningScore ?? 0;
  const headerTitle = isSelfProfile ? 'What Lore Knows About You' : 'Entity Knowledge Base';
  const headerDescription = isSelfProfile
    ? 'Facts, patterns, and connections Lore has collected from your conversations, journal, and resume — your personal knowledge base.'
    : `Everything LoreBook has learned about ${characterName} — facts, patterns, connections, and timeline. Grows as you chat and when duplicate mentions merge into this person.`;

  if (loading) {
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
              <div className="shrink-0 text-right leading-none">
                <span className="text-base font-bold tabular-nums text-white">{learningScore}</span>
                <span className="text-[10px] text-white/40">/100</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <StatPill icon={Brain} label="Facts" value={kb?.facts.length ?? 0} compact />
              <StatPill icon={Layers} label="Patterns" value={kb?.knowledgeClaims.length ?? 0} compact />
              <StatPill icon={Clock} label="Time" value={kb?.profile.timelineEventCount ?? 0} compact />
              <StatPill icon={MessageSquare} label="Mem" value={kb?.profile.memoryCount ?? 0} compact />
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
            <div className="flex shrink-0 flex-col items-end gap-1">
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
            <StatPill icon={Brain} label="Facts" value={kb?.facts.length ?? 0} />
            <StatPill icon={Layers} label="Patterns" value={kb?.knowledgeClaims.length ?? 0} />
            <StatPill icon={Clock} label="Timeline" value={kb?.profile.timelineEventCount ?? 0} />
            <StatPill icon={MessageSquare} label="Memories" value={kb?.profile.memoryCount ?? 0} />
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
            {Object.entries(
              kb.facts.reduce((acc: Record<string, typeof kb.facts>, f) => {
                if (!acc[f.category]) acc[f.category] = [];
                acc[f.category].push(f);
                return acc;
              }, {})
            ).map(([category, facts]) => (
              <div key={category}>
                <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                  {catLabel[category] ?? category}
                </p>
                <div className="space-y-2">
                  {facts.map((fact) => {
                    const pct = Math.round((fact.confidence ?? 0.7) * 100);
                    const badge = statusBadge[fact.status as string];
                    return (
                      <div
                        key={fact.id}
                        className="flex items-start gap-2.5 p-3 rounded-lg border border-white/6 bg-white/3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/85 leading-snug">{fact.fact}</p>
                          {fact.previous_value && (
                            <p className="text-[11px] text-white/35 mt-1 line-through">
                              {fact.previous_value}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          )}
                          <span
                            className={`text-[10px] tabular-nums font-semibold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}
                          >
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
            {kb!.sceneCandidates.map((c: any) => {
              const strength = Math.round((c.continuity_strength ?? 0) * 100);
              return (
                <div
                  key={c.id}
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
  value: number;
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
