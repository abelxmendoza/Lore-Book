/**
 * Character Info tab — priority-ordered profile overview.
 */

import {
  Clock,
  Heart,
  Info,
  MapPin,
  Smile,
  Sparkles,
  Star,
  Briefcase,
  User,
  Users,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { UnknownField } from '../ui/UnknownField';
import { fetchJson } from '../../lib/api';
import type { Character } from './CharacterProfileCard';
import { RelationshipFlagsPanel } from '../love/RelationshipFlagsPanel';
import { RelationshipLifeImpactPanel } from '../love/RelationshipLifeImpactPanel';
import { CharacterLoreProfileSection } from './CharacterLoreProfileSection';
import type { CharacterLoreProfile } from '../../api/characterLoreProfile';
import { resolveMockRelationshipInfluence } from '../../mocks/romanticLifeImpact';

type Relationship = {
  id?: string;
  character_id?: string;
  character_name?: string;
  relationship_type: string;
  status?: string;
  summary?: string;
  closeness_score?: number;
  is_situationship?: boolean;
  exclusivity_status?: string;
  compatibility_score?: number;
  relationship_health?: number;
  affection_score?: number;
  emotional_intensity?: number;
  is_current?: boolean;
  start_date?: string;
  pros?: string[];
  cons?: string[];
  red_flags?: string[];
  green_flags?: string[];
};

type CharacterAttribute = {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  evidence?: string;
};

type LifeMapItem = { label: string; value?: string; prompt: string };

export type CharacterInfoPanelProps = {
  editedCharacter: Character;
  setEditedCharacter: React.Dispatch<React.SetStateAction<Character>>;
  characterId: string;
  onUpdate: () => void;
  relationship?: Relationship;
  dynamics: { health?: { health_score?: number; trends?: { health_trend?: string } }; lifecycle?: { current_stage?: string } } | null;
  askInChat: (prompt: string) => void;
  relationshipStatus?: string;
  romanticConnections: Relationship[];
  strongestConnections: Relationship[];
  lifeMap: LifeMapItem[];
  occupations: string[];
  workplaces: string[];
  sideHustles: string[];
  behaviorAttributes: CharacterAttribute[];
  socialStanding?: { tier?: string; score?: number };
  characterAttributes: CharacterAttribute[];
  loadingAttributes: boolean;
  provenance: { mentionCount?: number; firstMentionedAt?: string; lastMentionedAt?: string; sourceUtterances?: { content: string; created_at: string }[] } | null;
  isMockDataEnabled: boolean;
  openCharacterByRelationship: (rel: Relationship) => void;
  loreProfile?: CharacterLoreProfile | null;
  loreProfileLoading?: boolean;
  onOpenCharacterById?: (characterId: string) => void;
};

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-white/35 truncate">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[10px] text-white/40 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function CharacterInfoPanel({
  editedCharacter,
  setEditedCharacter,
  characterId,
  onUpdate,
  relationship,
  dynamics,
  askInChat,
  relationshipStatus,
  romanticConnections,
  strongestConnections,
  lifeMap,
  occupations,
  workplaces,
  sideHustles,
  behaviorAttributes,
  socialStanding,
  characterAttributes,
  loadingAttributes,
  provenance,
  isMockDataEnabled,
  openCharacterByRelationship,
  loreProfile,
  loreProfileLoading = false,
  onOpenCharacterById,
}: CharacterInfoPanelProps) {
  const meta = (editedCharacter.metadata ?? {}) as Record<string, unknown>;
  const standingOverride = (meta.standing_override as { tier?: string } | null)?.tier ?? null;
  const impactOverride = typeof meta.impact_override === 'number' ? meta.impact_override : null;
  const tierLabels: Record<string, string> = {
    inner_circle: 'Inner circle',
    close: 'Close',
    regular: 'Regular',
    peripheral: 'Peripheral',
    public_figure: 'Public figure',
  };

  const persistOverride = async (key: string, value: unknown) => {
    setEditedCharacter((prev) => ({
      ...prev,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), [key]: value },
    }));
    try {
      await fetchJson(`/api/characters/${characterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ metadata: { [key]: value } }),
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to save ranking override:', err);
    }
  };

  const healthScore = dynamics?.health?.health_score;
  const healthTrend = dynamics?.health?.trends?.health_trend;
  const memoryCount = editedCharacter.memory_count ?? 0;
  const connectionCount = editedCharacter.relationship_count ?? editedCharacter.relationships?.length ?? 0;
  const standing =
    standingOverride ?? socialStanding?.tier ?? editedCharacter.importance_level ?? 'Still learning';

  const mockProvenanceMap: Record<string, NonNullable<CharacterInfoPanelProps['provenance']>> = {
    'Sarah Chen': { mentionCount: 156, firstMentionedAt: '2018-09-20T00:00:00Z', lastMentionedAt: new Date(Date.now() - 7 * 86400000).toISOString(), sourceUtterances: [{ content: 'I had coffee with Sarah today — she was the first person I told about wanting to leave tech.', created_at: '2018-09-20T00:00:00Z' }] },
    'Marcus Johnson': { mentionCount: 98, firstMentionedAt: '2020-03-12T00:00:00Z', lastMentionedAt: new Date(Date.now() - 14 * 86400000).toISOString(), sourceUtterances: [{ content: 'Met Marcus at that entrepreneurship event.', created_at: '2020-03-12T00:00:00Z' }] },
  };
  const p = isMockDataEnabled ? mockProvenanceMap[editedCharacter.name] ?? provenance : provenance;
  const lifeImpact =
    relationship && isMockDataEnabled
      ? resolveMockRelationshipInfluence({
          relationshipId: relationship.id,
          personId: characterId,
          personName: editedCharacter.name,
        })
      : undefined;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. Story summary ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-black/40 to-black/60 p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-white">Who they are to you</h2>
            {editedCharacter.role && (
              <p className="text-xs text-primary/80 mt-0.5 capitalize">{editedCharacter.role.replace(/_/g, ' ')}</p>
            )}
          </div>
        </div>
        {editedCharacter.summary ? (
          <p className="text-sm sm:text-base text-white/85 leading-relaxed whitespace-pre-wrap">{editedCharacter.summary}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-white/45 italic">
              LoreBook is still learning {editedCharacter.name.split(' ')[0]}&apos;s story.
            </p>
            <UnknownField
              label="Their story"
              prompt={`Let me tell you about ${editedCharacter.name}: `}
              onAskInChat={askInChat}
            />
          </div>
        )}
        {editedCharacter.archetype && (
          <Badge variant="outline" className="mt-3 bg-purple-500/10 text-purple-300 border-purple-500/30 text-xs">
            {editedCharacter.archetype}
          </Badge>
        )}
      </section>

      {/* ── 2. At a glance ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">At a glance</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <StatCell
            label="Standing"
            value={tierLabels[standing] ?? String(standing).replace(/_/g, ' ')}
          />
          <StatCell label="Memories" value={memoryCount} sub={memoryCount === 1 ? 'mention' : 'mentions'} />
          <StatCell label="Connections" value={connectionCount} />
          {relationshipStatus ? (
            <StatCell label="Status" value={relationshipStatus} />
          ) : (
            <StatCell label="Depth" value={editedCharacter.relationship_depth?.replace(/_/g, ' ') ?? '—'} />
          )}
          {healthScore != null && (
            <StatCell
              label="Relationship health"
              value={`${healthScore}%`}
              sub={healthTrend ? `${healthTrend === 'improving' ? '↑' : healthTrend === 'declining' ? '↓' : '→'} ${healthTrend}` : undefined}
            />
          )}
          {editedCharacter.importance_score != null && (
            <StatCell label="Importance" value={`${Math.round(editedCharacter.importance_score)}/100`} />
          )}
          {dynamics?.lifecycle?.current_stage && (
            <StatCell label="Life stage" value={dynamics.lifecycle.current_stage.replace(/_/g, ' ')} />
          )}
          {(editedCharacter.alias?.length ?? 0) > 0 && (
            <StatCell label="Also known as" value={editedCharacter.alias!.slice(0, 2).join(', ')} />
          )}
        </div>
      </section>

      {/* ── Skills, hobbies, groups, people (mention-derived lore) ───── */}
      <CharacterLoreProfileSection
        profile={loreProfile ?? null}
        loading={loreProfileLoading}
        characterFirstName={editedCharacter.name.split(' ')[0]}
        onAskInChat={askInChat}
        onOpenCharacter={onOpenCharacterById}
      />

      {/* ── 3. Your relationship (romantic / close) ──────────────────── */}
      {relationship && (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">Your relationship</h3>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="outline" className="bg-rose-500/15 text-rose-200 border-rose-500/30 capitalize">
              {relationship.relationship_type.replace(/_/g, ' ')}
            </Badge>
            {relationship.is_situationship && (
              <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300">Situationship</Badge>
            )}
            {relationship.status && (
              <Badge variant="outline" className="text-xs capitalize border-white/15 text-white/60">{relationship.status}</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <StatCell label="Compatibility" value={`${Math.round((relationship.compatibility_score ?? 0) * 100)}%`} />
            <StatCell label="Health" value={`${Math.round((relationship.relationship_health ?? 0) * 100)}%`} />
            <StatCell label="Your interest" value={`${Math.round((relationship.affection_score ?? 0) * 100)}%`} />
            {relationship.start_date && (
              <StatCell
                label="Since"
                value={new Date(relationship.start_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              />
            )}
          </div>
          {(relationship.pros?.length ?? 0) > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {relationship.pros!.length > 0 && (
                <ul className="space-y-1 text-white/70">
                  {relationship.pros!.slice(0, 3).map((pro, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-emerald-400">+</span>{pro}</li>
                  ))}
                </ul>
              )}
              {(relationship.cons?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-white/70">
                  {relationship.cons!.slice(0, 3).map((con, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-red-400">−</span>{con}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3">
            <RelationshipFlagsPanel
              redFlags={relationship.red_flags ?? []}
              greenFlags={relationship.green_flags ?? []}
              compact
            />
          </div>
          {lifeImpact && (
            <div className="mt-4 pt-4 border-t border-rose-500/15">
              <h4 className="text-xs font-semibold text-rose-200/90 mb-2">Life impact</h4>
              <RelationshipLifeImpactPanel
                influence={lifeImpact}
                personName={editedCharacter.name.split(' ')[0]}
                compact
              />
            </div>
          )}
        </section>
      )}

      {/* ── 4. Work & life ───────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <section className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3.5">
          <h3 className="text-xs font-bold text-amber-200/90 flex items-center gap-1.5 mb-2">
            <Briefcase className="h-3.5 w-3.5" /> Work
          </h3>
          {occupations.length > 0 || workplaces.length > 0 || sideHustles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {[...occupations, ...workplaces, ...sideHustles].slice(0, 8).map((v) => (
                <Badge key={v} variant="outline" className="text-[11px] bg-amber-500/10 text-amber-200 border-amber-500/25">{v}</Badge>
              ))}
            </div>
          ) : (
            <UnknownField label="Work" prompt={`What ${editedCharacter.name} does for work: `} onAskInChat={askInChat} />
          )}
        </section>

        <section className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3.5">
          <h3 className="text-xs font-bold text-cyan-200/90 flex items-center gap-1.5 mb-2">
            <MapPin className="h-3.5 w-3.5" /> Life details
          </h3>
          <div className="space-y-1.5">
            {lifeMap.filter((i) => i.value).slice(0, 4).map((item) => (
              <div key={item.label} className="flex justify-between gap-2 text-xs">
                <span className="text-white/40">{item.label}</span>
                <span className="text-white/80 text-right truncate">{item.value}</span>
              </div>
            ))}
            {lifeMap.filter((i) => !i.value).slice(0, 2).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => askInChat(item.prompt)}
                className="text-[11px] text-primary/80 hover:text-primary"
              >
                + Add {item.label.toLowerCase()}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── 5. Key people ──────────────────────────────────────────────── */}
      {(strongestConnections.length > 0 || romanticConnections.length > 0) && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Key people
          </h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {[...romanticConnections, ...strongestConnections.filter((s) => !romanticConnections.some((r) => r.character_id === s.character_id))].slice(0, 4).map((rel) => (
              <button
                key={rel.id ?? rel.character_id ?? rel.character_name}
                type="button"
                onClick={() => openCharacterByRelationship(rel)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left hover:border-primary/30 hover:bg-primary/5 transition-colors touch-manipulation"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white truncate">{rel.character_name}</span>
                  {rel.closeness_score != null && (
                    <span className="text-[10px] text-emerald-400 shrink-0">{rel.closeness_score}/10</span>
                  )}
                </div>
                <p className="text-[10px] text-white/40 capitalize mt-0.5 truncate">
                  {rel.relationship_type.replace(/_/g, ' ')}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 6. Personality ───────────────────────────────────────────── */}
      {behaviorAttributes.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Smile className="h-3.5 w-3.5" /> Personality & patterns
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {behaviorAttributes.slice(0, 8).map((attr) => (
              <span
                key={`${attr.attributeType}-${attr.attributeValue}`}
                className="text-xs px-2.5 py-1 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-200"
                title={attr.evidence}
              >
                {attr.attributeValue}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── 7. Your ranking overrides ──────────────────────────────────── */}
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Your ranking</h3>
        </div>
        <p className="text-xs text-white/50 mb-3">Override computed standing — your call wins.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 mb-1 block">Standing</label>
            <select
              data-testid="standing-override-select"
              aria-label="Standing tier override"
              value={standingOverride ?? 'auto'}
              onChange={(e) => {
                const v = e.target.value;
                void persistOverride('standing_override', v === 'auto' ? null : { tier: v, set_at: new Date().toISOString() });
              }}
              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="auto">Auto{tierLabels[socialStanding?.tier ?? ''] ? ` (${tierLabels[socialStanding!.tier!]})` : ''}</option>
              <option value="inner_circle">Inner circle</option>
              <option value="close">Close</option>
              <option value="regular">Regular</option>
              <option value="peripheral">Peripheral</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 mb-1 block">
              Impact on you {impactOverride !== null ? `· ${impactOverride}/100` : ''}
            </label>
            {impactOverride === null ? (
              <button
                type="button"
                data-testid="impact-override-enable"
                onClick={() => void persistOverride('impact_override', Math.round(editedCharacter.analytics?.character_influence_on_user ?? 50))}
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-left text-xs text-white/60 hover:border-emerald-500/40"
              >
                Auto ({Math.round(editedCharacter.analytics?.character_influence_on_user ?? 0)}/100) — tap to set
              </button>
            ) : (
              <input
                type="range"
                min={0}
                max={100}
                value={impactOverride}
                aria-label="Impact on me"
                data-testid="impact-override-slider"
                onChange={(e) => setEditedCharacter((prev) => ({
                  ...prev,
                  metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), impact_override: Number(e.target.value) },
                }))}
                onPointerUp={(e) => void persistOverride('impact_override', Number((e.currentTarget as HTMLInputElement).value))}
                className="w-full accent-emerald-400 mt-2"
              />
            )}
          </div>
        </div>
      </section>

      {/* ── 8. Detected attributes ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Detected from chat
          </h3>
          {characterAttributes.length > 0 && (
            <span className="text-[10px] text-white/25">{characterAttributes.length}</span>
          )}
        </div>
        {loadingAttributes ? (
          <p className="text-xs text-white/40 flex items-center gap-2 py-2">
            <Clock className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : characterAttributes.length === 0 ? (
          <p className="text-xs text-white/35 py-1">
            No attributes yet — keep journaling about {editedCharacter.name.split(' ')[0]}.
          </p>
        ) : (
          <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {characterAttributes.slice(0, 12).map((attr, idx) => (
              <div key={idx} className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.02]">
                <span className="text-[9px] uppercase tracking-wide text-white/30 shrink-0 mt-0.5 w-16">
                  {attr.attributeType.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90">{attr.attributeValue}</p>
                  {attr.evidence && (
                    <p className="text-[10px] text-white/35 mt-0.5 line-clamp-1 italic">{attr.evidence}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 9. Provenance ──────────────────────────────────────────────── */}
      {p && (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> How LoreBook knows them
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mb-2">
            {(p.mentionCount ?? 0) > 0 && <span><strong className="text-white/75">{p.mentionCount}</strong> mentions</span>}
            {p.firstMentionedAt && (
              <span>First: {new Date(p.firstMentionedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            )}
            {p.lastMentionedAt && (
              <span>Last: {new Date(p.lastMentionedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            )}
          </div>
          {p.sourceUtterances?.[0] && (
            <blockquote className="border-l-2 border-white/15 pl-3 text-xs text-white/55 italic line-clamp-2">
              &ldquo;{p.sourceUtterances[0].content}&rdquo;
            </blockquote>
          )}
        </section>
      )}

      <p className="text-[10px] text-white/30 flex items-center gap-1.5 pb-2">
        <Info className="h-3 w-3 shrink-0" />
        Profile updates from your conversations. Use Chat to add or correct details.
      </p>
    </div>
  );
}
