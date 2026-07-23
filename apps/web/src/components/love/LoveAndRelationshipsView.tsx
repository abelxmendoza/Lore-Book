// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Heart, Search, TrendingUp, Users, Sparkles, Ban, RotateCcw, AlertTriangle, RefreshCw, BookOpen, Link2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  GridListViewToolbar,
  readStoredCardViewMode,
  type CardViewMode,
} from '../ui/GridListViewToolbar';
import { fetchCharacterList } from '../../api/characterList';
import { useMockData } from '../../contexts/MockDataContext';
import { buildDatingRomanceClipboardText } from '../../lib/datingRomanceClipboard';
import { isIndividualPersonName } from '../../lib/personNameValidation';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { 
  getMockRomanticRelationships, 
  getMockRomanticRelationshipsByFilter,
  buildSimulatedRomanticRelationship,
  type MockRomanticRelationship 
} from '../../mocks/romanticRelationships';
import { getMockCharacterSuggestionBookNames } from '../../mocks/characterSuggestions';
import type { CharacterSuggestion } from '../../api/entitySuggestions';
import { RelationshipCard } from './RelationshipCard';
import { RelationshipDetailModal } from './RelationshipDetailModal';
import { RankingView } from './RankingView';
import { DetectedCharacterSuggestions } from '../characters/DetectedCharacterSuggestions';
import { RomanticLexicalInsights } from './RomanticLexicalInsights';
import { RomanticStoryShowcase } from './RomanticStoryShowcase';
import {
  RomanticInterestChatLauncher,
  type RomanticInterestCharacterOption,
} from './RomanticInterestChatLauncher';
import type { RomanticRescanSummary } from '../../api/romanticRelationships';
import { apiCache } from '../../lib/cache';
import { fetchCharacterById } from '../../lib/hydrateBookEntity';
import { invalidateCache } from '../../lib/requestCache';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import type { Character } from '../characters/CharacterProfileCard';
import {
  useGetRomanticRelationshipsQuery,
  useLinkRomanticRelationshipToCharacterMutation,
  useRescanRomanticRelationshipsMutation,
} from '../../store/api/entitiesApi';

export type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
  character_id?: string | null;
  character_sex?: string | null;
  user_romantic_filter?: {
    user_sex?: string | null;
    user_orientation?: string | null;
    partner_sex?: string | null;
    reviewed?: boolean;
    eligible?: boolean | null;
    note?: string;
  };
  // Sprint AD: deterministic dynamics persisted under metadata.signals.
  metadata?: {
    signals?: {
      obsession_score?: number;
      attachment_intensity?: number;
      evidence_strength?: number;
      signal_strength?: 'low' | 'moderate' | 'high';
    };
  } & Record<string, unknown>;
};

// Sprint AD: read the persisted obsession signal (0..1).
const obsessionScore = (r: RomanticRelationship) => r.metadata?.signals?.obsession_score ?? 0;

type CharacterListItem = {
  id: string;
  name: string;
  alias?: string[] | null;
  metadata?: { sex?: string | null } | null;
};

type FilterType =
  | 'all'
  | 'active'
  | 'past'
  | 'no_contact'
  | 'reconnection'
  | 'situationships'
  | 'dating'
  | 'crushes'
  | 'high_risk'
  | 'rankings';

const END_STATE_STATUSES = new Set(['ended', 'ghosted', 'blocked']);
const NO_CONTACT_STATUSES = new Set(['ghosted', 'blocked']);
const RECONNECTION_STATUSES = new Set(['rekindled']);
const CRUSH_TYPES = new Set(['crush', 'obsession', 'infatuation', 'lust']);
const DATING_TYPES = new Set(['dating', 'boyfriend', 'girlfriend', 'lover', 'in_love', 'fiancé', 'fiancée', 'wife', 'husband']);

const relationshipStatus = (relationship: RomanticRelationship) => relationship.status.toLowerCase();
const relationshipType = (relationship: RomanticRelationship) => relationship.relationship_type.toLowerCase();
const isEndedRelationship = (relationship: RomanticRelationship) =>
  !relationship.is_current || END_STATE_STATUSES.has(relationshipStatus(relationship)) || relationshipType(relationship).startsWith('ex_');
const isActiveRelationship = (relationship: RomanticRelationship) =>
  relationship.is_current && !isEndedRelationship(relationship);
const isCrushRelationship = (relationship: RomanticRelationship) =>
  CRUSH_TYPES.has(relationshipType(relationship));
const isDatingRelationship = (relationship: RomanticRelationship) =>
  DATING_TYPES.has(relationshipType(relationship)) && isActiveRelationship(relationship);
const isNoContactRelationship = (relationship: RomanticRelationship) =>
  NO_CONTACT_STATUSES.has(relationshipStatus(relationship));
const hasReconnectionPotential = (relationship: RomanticRelationship) =>
  RECONNECTION_STATUSES.has(relationshipStatus(relationship)) ||
  (relationship.green_flags?.length ?? 0) > (relationship.red_flags?.length ?? 0) ||
  (relationship.compatibility_score >= 0.6 && relationship.relationship_health >= 0.45 && obsessionScore(relationship) < 0.6 && !isNoContactRelationship(relationship));
const isHighRiskRelationship = (relationship: RomanticRelationship) =>
  (relationship.red_flags?.length ?? 0) >= 2 ||
  relationship.relationship_health < 0.4 ||
  obsessionScore(relationship) >= 0.6 ||
  ['blocked', 'ghosted', 'obsession', 'complicated'].includes(relationshipStatus(relationship)) ||
  relationshipType(relationship) === 'obsession';

const RELATIONSHIP_GRID_CLASS =
  'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr';
const LOVE_VIEW_STORAGE_KEY = 'lk_dating_romance_view';

export const LoveAndRelationshipsView = () => {
  const { useMockData: shouldUseMockData } = useMockData();
  const [relationships, setRelationships] = useState<RomanticRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRelationship, setSelectedRelationship] = useState<string | null>(null);
  const [existingCharacterNames, setExistingCharacterNames] = useState<string[]>([]);
  const [existingCharacters, setExistingCharacters] = useState<RomanticInterestCharacterOption[]>([]);
  const [romanticInterestBusy, setRomanticInterestBusy] = useState(false);
  const [romanticInterestError, setRomanticInterestError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanNotice, setRescanNotice] = useState<string | null>(null);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [rescanSummary, setRescanSummary] = useState<RomanticRescanSummary | null>(null);
  const [highlightedRelationshipId, setHighlightedRelationshipId] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CardViewMode>(() =>
    readStoredCardViewMode(LOVE_VIEW_STORAGE_KEY, 'grid'),
  );
  const romanticRelationshipsQuery = useGetRomanticRelationshipsQuery(undefined, { skip: shouldUseMockData });
  const [linkRomanticRelationshipToCharacter] = useLinkRomanticRelationshipToCharacterMutation();
  const [rescanRomanticRelationships] = useRescanRomanticRelationshipsMutation();
  const relationshipsGridRef = useRef<HTMLDivElement>(null);

  const scrollToRelationship = useCallback((relationshipId: string) => {
    window.setTimeout(() => {
      const el = document.querySelector(`[data-testid="relationship-card-${relationshipId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 420);
  }, []);

  const handleSuggestionAdded = useCallback((suggestion: CharacterSuggestion) => {
    if (shouldUseMockData) {
      const simulated = buildSimulatedRomanticRelationship(suggestion);
      setRelationships(prev => {
        const exists = prev.some(
          rel => rel.person_name?.toLowerCase() === suggestion.name.toLowerCase()
        );
        return exists ? prev : [simulated as RomanticRelationship, ...prev];
      });
      setExistingCharacterNames(prev =>
        prev.some(n => n.toLowerCase() === suggestion.name.toLowerCase())
          ? prev
          : [...prev, suggestion.name]
      );
      setHighlightedRelationshipId(simulated.id);
      setActiveFilter('all');
      scrollToRelationship(simulated.id);
      window.setTimeout(() => setHighlightedRelationshipId(null), 4500);
      return;
    }
    void loadCharacterNames();
    void loadRelationships();
  }, [shouldUseMockData, scrollToRelationship]);

  useEffect(() => {
    loadRelationships();
  }, [activeFilter, shouldUseMockData]);

  useEffect(() => {
    void loadCharacterNames();
  }, [shouldUseMockData]);

  const loadCharacterNames = async () => {
    if (shouldUseMockData) {
      const names = getMockCharacterSuggestionBookNames('romantic');
      setExistingCharacterNames(names);
      setExistingCharacters(
        names.map((name) => ({
          id: `demo-character-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name,
        })),
      );
      return;
    }

    try {
      const list = await fetchCharacterList<CharacterListItem>();
      setExistingCharacters(
        list.map((character) => ({
          id: character.id,
          name: character.name,
          aliases: Array.isArray(character.alias) ? character.alias : [],
          sex: character.metadata?.sex ?? null,
        })),
      );
      setExistingCharacterNames(
        list.flatMap(character => [
          character.name,
          ...(Array.isArray(character.alias) ? character.alias : []),
        ])
      );
    } catch {
      setExistingCharacterNames([]);
      setExistingCharacters([]);
    }
  };

  const openRomanticInterestChat = useCallback(
    async ({
      name,
      character,
    }: {
      name: string;
      character?: RomanticInterestCharacterOption;
    }) => {
      setRomanticInterestBusy(true);
      setRomanticInterestError(null);
      try {
        if (character) {
          // Existing Character Book entry — focus chat on the real character.
          openChatWithFocus({
            entityId: character.id,
            entityName: character.name,
            entityType: 'character',
            sourceSurface: 'love',
            sourceLabel: 'Dating & Romance',
            knowledgeScope: 'romantic interest, shared history, feelings, and relationship context',
            initialPrompt: `I want to talk about ${character.name} as a romantic interest. Help me capture who they are, how we know each other, and what I am feeling. Please do not assume that they feel the same way or invent details I have not shared.`,
            arrivedAt: Date.now(),
          });
        } else {
          // Brand-new person — no character exists yet. Send the user to chat to
          // introduce them (name, aliases, nicknames) so the normal chat-extraction
          // pipeline creates and identifies the character organically, instead of
          // pre-creating a bare card from a typed name alone.
          openChatWithFocus({
            entityId: `pending:romantic-interest:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            entityName: name,
            entityType: 'memory',
            sourceSurface: 'love',
            sourceLabel: 'Dating & Romance',
            knowledgeScope: 'romantic interest, shared history, feelings, and relationship context',
            initialPrompt:
              `I want to tell you about ${name}, someone I'm romantically interested in. ` +
              `Their name is ${name} — let me know any aliases or nicknames I call them too, ` +
              `plus how we met and what I'm feeling, so you can get to know them.`,
            arrivedAt: Date.now(),
          });
        }
      } catch (error) {
        setRomanticInterestError(
          error instanceof Error ? error.message : 'Could not open a focused chat right now.',
        );
      } finally {
        setRomanticInterestBusy(false);
      }
    },
    [],
  );

  // People with an active romantic interest shouldn't be offered again in the
  // "Add a new romantic interest" search — an ended one (ex/ghosted/blocked)
  // still can be, per isActiveRelationship.
  const activeRomanticKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const rel of relationships) {
      if (!isActiveRelationship(rel)) continue;
      const id = rel.character_id ?? (rel.person_type === 'character' ? rel.person_id : null);
      if (id) keys.add(id);
      if (rel.person_name) keys.add(rel.person_name.trim().toLowerCase());
    }
    return keys;
  }, [relationships]);

  const romanticInterestCandidates = useMemo(() => {
    const merged = [
      // Character Book entries first — they carry aliases/sex; relationship-only
      // stubs (below) are just a fallback for people not yet in the Character Book.
      ...existingCharacters,
      ...relationships
        .filter((rel) => rel.person_name && (rel.character_id || rel.person_type === 'character'))
        .map((rel) => ({
          id: rel.character_id ?? rel.person_id,
          name: rel.person_name!,
        })),
    ].filter(
      (character, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.id === character.id ||
            candidate.name.toLowerCase() === character.name.toLowerCase(),
        ) === index,
    );
    return merged.filter(
      (character) =>
        !activeRomanticKeys.has(character.id) &&
        !activeRomanticKeys.has(character.name.trim().toLowerCase()),
    );
  }, [existingCharacters, relationships, activeRomanticKeys]);

  const loadRelationships = async () => {
    setLoading(true);
    try {
      // Use mock data if enabled
      if (shouldUseMockData) {
        const mockRelationships = getMockRomanticRelationshipsByFilter(
          activeFilter === 'rankings' ? 'all' : activeFilter
        );
        setRelationships(mockRelationships as RomanticRelationship[]);
        setLoading(false);
        return;
      }

      const data = await romanticRelationshipsQuery.refetch().unwrap() as {
        success: boolean;
        relationships: RomanticRelationship[];
      };

      if (data.success) {
        const withNames = data.relationships.filter(
          (rel) => isIndividualPersonName(rel.person_name)
        );
        setRelationships(withNames);
      }
    } catch (error) {
      console.error('Failed to load relationships:', error);
      // Fallback to mock data on error if mock data is enabled
      if (shouldUseMockData) {
        const mockRelationships = getMockRomanticRelationshipsByFilter(
          activeFilter === 'rankings' ? 'all' : activeFilter
        );
        setRelationships(mockRelationships as RomanticRelationship[]);
      } else {
        setRelationships([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async () => {
    if (shouldUseMockData) {
      setRescanNotice('Demo mode — sign in to rescan your real love story from conversations.');
      setRescanError(null);
      return;
    }
    setRescanning(true);
    setRescanNotice(null);
    setRescanError(null);
    try {
      apiCache.deletePattern(/\/api\/conversation\/romantic/);
      const result = await rescanRomanticRelationships().unwrap() as {
        success: boolean;
        summary: RomanticRescanSummary;
      };
      setRescanSummary(result.summary);
      const s = result.summary;
      const total = s.relationshipsUpserted;
      setRescanNotice(
        total > 0
          ? `Rescanned ${s.romanticEpisodes} romantic moment${s.romanticEpisodes === 1 ? '' : 's'} — ${total} relationship${total === 1 ? '' : 's'} updated from glossary + ontology parsing.`
          : s.romanticEpisodes > 0
            ? `Found ${s.romanticEpisodes} romantic episode${s.romanticEpisodes === 1 ? '' : 's'} — relationships are already up to date.`
            : 'Rescan complete — no romantic language detected in your history yet. Mention someone in chat to start tracking.'
      );
      await loadRelationships();
      window.dispatchEvent(new CustomEvent('lk:romantic-relationships-updated'));
    } catch (error) {
      setRescanError(error instanceof Error ? error.message : 'Romantic rescan failed');
    } finally {
      setRescanning(false);
    }
  };

  const openCharacterCard = async (rel: RomanticRelationship) => {
    if (shouldUseMockData) return;
    const characterId = rel.character_id ?? (rel.person_type === 'character' ? rel.person_id : null);
    if (!characterId) return;
    setRelationshipError(null);
    try {
      const character = await fetchCharacterById<Character>(characterId);
      setSelectedCharacter(character);
    } catch (error) {
      setRelationshipError(error instanceof Error ? error.message : 'Could not open Character Book card.');
    }
  };

  const linkRelationshipToCharacter = async (rel: RomanticRelationship) => {
    if (shouldUseMockData) return;
    setLinkBusyId(rel.id);
    setRelationshipError(null);
    try {
      const result = await linkRomanticRelationshipToCharacter({
        id: rel.id,
        character_name: rel.person_name,
      }).unwrap();
      invalidateCache();
      await loadRelationships();
      if (result.character_id) {
        const character = await fetchCharacterById<Character>(result.character_id);
        setSelectedCharacter(character);
      }
    } catch (error) {
      setRelationshipError(error instanceof Error ? error.message : 'Could not link relationship to Character Book.');
    } finally {
      setLinkBusyId(null);
    }
  };

  const filteredRelationships = relationships.filter(rel => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      rel.person_name?.toLowerCase().includes(term) ||
      rel.relationship_type.toLowerCase().includes(term) ||
      rel.status.toLowerCase().includes(term)
    );
  });

  const activeRelationships = filteredRelationships.filter(isActiveRelationship);
  const pastRelationships = filteredRelationships.filter(isEndedRelationship);
  const noContactRelationships = filteredRelationships.filter(isNoContactRelationship);
  const reconnectionRelationships = filteredRelationships.filter(r => isEndedRelationship(r) && hasReconnectionPotential(r));
  const situationships = filteredRelationships.filter(r => r.is_situationship);
  const datingRelationships = filteredRelationships.filter(isDatingRelationship);
  const crushes = filteredRelationships.filter(isCrushRelationship);
  const highRiskRelationships = filteredRelationships.filter(isHighRiskRelationship);
  const visibleRelationships = (() => {
    switch (activeFilter) {
      case 'active':
        return activeRelationships;
      case 'past':
        return pastRelationships;
      case 'no_contact':
        return noContactRelationships;
      case 'reconnection':
        return reconnectionRelationships;
      case 'situationships':
        return situationships;
      case 'dating':
        return datingRelationships;
      case 'crushes':
        return crushes;
      case 'high_risk':
        return highRiskRelationships;
      case 'rankings':
        return [];
      default:
        return filteredRelationships;
    }
  })();
  const clipboardRelationships =
    activeFilter === 'rankings' ? filteredRelationships : visibleRelationships;
  const clipboardText = buildDatingRomanceClipboardText(clipboardRelationships);

  const renderRelationshipCard = (rel: RomanticRelationship) => (
    <RelationshipCard
      key={rel.id}
      relationship={rel}
      highlighted={highlightedRelationshipId === rel.id}
      onClick={() => setSelectedRelationship(rel.id)}
      onOpenCharacter={openCharacterCard}
      onLinkCharacter={linkRelationshipToCharacter}
      linkBusy={linkBusyId === rel.id}
    />
  );

  const renderRelationshipListRow = (rel: RomanticRelationship) => {
    const hasCharacterCard = rel.person_type === 'character' || Boolean(rel.character_id);
    const signals = rel.metadata?.signals;
    const teaser =
      rel.user_romantic_filter?.note ??
      (typeof rel.metadata?.lexical_evidence === 'string'
        ? rel.metadata.lexical_evidence
        : null);
    const score = (value: number | null | undefined) =>
      value == null ? null : `${Math.round(value * 100)}%`;

    return (
      <div
        key={rel.id}
        data-testid={`relationship-card-${rel.id}`}
        className={`flex flex-col sm:flex-row sm:items-stretch hover:bg-white/5 transition-colors ${
          highlightedRelationshipId === rel.id
            ? 'bg-pink-500/10 ring-1 ring-inset ring-pink-400/50'
            : ''
        }`}
      >
        <button
          type="button"
          onClick={() => setSelectedRelationship(rel.id)}
          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
        >
          <Heart className="h-4 w-4 text-pink-300/75 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-white truncate">
                {rel.person_name || rel.relationship_type.replace(/_/g, ' ')}
              </p>
              <span className="text-[10px] text-white/45 shrink-0">
                {rel.status.replace(/_/g, ' ')}
              </span>
            </div>
            {teaser && (
              <p className="text-xs text-white/50 line-clamp-2 mt-0.5">{teaser}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-white/40">
              <span>{rel.relationship_type.replace(/_/g, ' ')}</span>
              {rel.is_situationship && <span>Situationship</span>}
              {rel.exclusivity_status && <span>{rel.exclusivity_status}</span>}
              {score(rel.affection_score) && <span>Affection: {score(rel.affection_score)}</span>}
              {score(rel.compatibility_score) && (
                <span>Compatibility: {score(rel.compatibility_score)}</span>
              )}
              {score(rel.relationship_health) && (
                <span>Health: {score(rel.relationship_health)}</span>
              )}
              {signals?.attachment_intensity != null && (
                <span>Attachment: {score(signals.attachment_intensity)}</span>
              )}
              {(rel.red_flags?.length ?? 0) > 0 && <span>{rel.red_flags.length} red flags</span>}
              {(rel.green_flags?.length ?? 0) > 0 && <span>{rel.green_flags.length} green flags</span>}
              {rel.start_date && (
                <span>Started: {new Date(rel.start_date).toLocaleDateString()}</span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-white/25 mt-0.5 shrink-0" />
        </button>
        <div className="flex items-center gap-2 px-3 pb-2.5 sm:py-2.5 sm:pl-0">
          {hasCharacterCard ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void openCharacterCard(rel)}
              className="h-7 border-cyan-500/30 bg-cyan-500/10 px-2 text-[10px] text-cyan-100 hover:bg-cyan-500/20"
            >
              <BookOpen className="mr-1 h-3 w-3" />
              Character card
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void linkRelationshipToCharacter(rel)}
              disabled={linkBusyId === rel.id}
              className="h-7 border-pink-500/30 bg-pink-500/10 px-2 text-[10px] text-pink-100 hover:bg-pink-500/20"
            >
              <Link2 className="mr-1 h-3 w-3" />
              {linkBusyId === rel.id ? 'Linking...' : 'Link to Character Book'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderRelationshipCollection = (items: RomanticRelationship[]) =>
    viewMode === 'list' ? (
      <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/6">
        {items.map(renderRelationshipListRow)}
      </div>
    ) : (
      <div className={RELATIONSHIP_GRID_CLASS}>
        {items.map(renderRelationshipCard)}
      </div>
    );

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="border-pink-500/30 bg-gradient-to-br from-pink-950/20 to-purple-950/20">
          <CardContent className="p-8">
            <div className="text-center text-white/60">
              <Heart className="w-12 h-12 mx-auto mb-4 text-pink-400/50 animate-pulse" />
              <p>Loading your love story...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="love-relationships-view">
      {/* Hero Section */}
      <Card className="border-pink-500/30 bg-gradient-to-br from-pink-950/20 via-purple-950/20 to-pink-950/20">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div>
              <CardTitle className="flex items-center gap-2 sm:gap-3 text-lg sm:text-2xl text-white mb-2">
                <Heart className="w-5 h-5 sm:w-7 sm:h-7 text-pink-400" />
                Your Love Story
              </CardTitle>
              <p className="text-white/70 text-xs sm:text-sm">
                {relationships.length} relationship{relationships.length !== 1 ? 's' : ''} tracked
                {activeRelationships.length > 0 && ` · ${activeRelationships.length} active`}
                {pastRelationships.length > 0 && ` · ${pastRelationships.length} past`}
                {noContactRelationships.length > 0 && ` · ${noContactRelationships.length} no contact`}
                {crushes.length > 0 && ` · ${crushes.length} crush${crushes.length !== 1 ? 'es' : ''}`}
                {shouldUseMockData && (
                  <span className="ml-2 text-[10px] sm:text-xs text-yellow-400/80">(Mock Data)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {shouldUseMockData && (
                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-[10px] sm:text-xs">
                  <span>Demo</span>
                </Badge>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRescan()}
                disabled={rescanning}
                className="border-pink-500/30 bg-pink-500/10 text-pink-100 hover:bg-pink-500/20 text-[10px] sm:text-xs h-8"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${rescanning ? 'animate-spin' : ''}`} />
                {rescanning ? 'Rescanning…' : 'Rescan love story'}
              </Button>
              <Badge variant="outline" className="bg-pink-500/20 text-pink-300 border-pink-500/30 text-[10px] sm:text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                AI-Powered
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {(rescanNotice || rescanError || relationshipError) && (
        <p
          className={`text-xs rounded border px-3 py-2 ${
            rescanError || relationshipError
              ? 'text-red-300 border-red-500/30 bg-red-500/10'
              : 'text-emerald-200 border-emerald-500/25 bg-emerald-500/10'
          }`}
        >
          {relationshipError ?? rescanError ?? rescanNotice}
        </p>
      )}

      <RomanticInterestChatLauncher
        characters={romanticInterestCandidates}
        busy={romanticInterestBusy}
        error={romanticInterestError}
        onContinue={openRomanticInterestChat}
      />

      <RomanticStoryShowcase demoMode={shouldUseMockData} />

      <RomanticLexicalInsights
        demoMode={shouldUseMockData}
        rescanSummary={rescanSummary}
        relationships={relationships}
      />

      <DetectedCharacterSuggestions
        variant="romantic"
        demoMode={shouldUseMockData}
        existingCharacterNames={
          shouldUseMockData
            ? getMockCharacterSuggestionBookNames('romantic')
            : [
                ...existingCharacterNames,
                ...relationships.flatMap(rel => rel.person_name ? [rel.person_name] : []),
              ]
        }
        onCharacterAdded={handleSuggestionAdded}
        onRescanComplete={() => {
          void loadRelationships();
        }}
      />

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search relationships..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        <GridListViewToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          copyText={clipboardText}
          copyDisabled={clipboardRelationships.length === 0}
          storageKey={LOVE_VIEW_STORAGE_KEY}
        />
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)}>
        <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="all" 
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[60px] sm:min-w-0"
          >
            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>All</span>
          </TabsTrigger>
          <TabsTrigger 
            value="active"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Active</span>
          </TabsTrigger>
          <TabsTrigger 
            value="past"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-gray-500/20 data-[state=active]:text-gray-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[60px] sm:min-w-0"
          >
            <span>Past</span>
          </TabsTrigger>
          <TabsTrigger 
            value="no_contact"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[90px] sm:min-w-0"
          >
            <Ban className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">No Contact</span>
            <span className="sm:hidden">No Contact</span>
          </TabsTrigger>
          <TabsTrigger 
            value="reconnection"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[95px] sm:min-w-0"
          >
            <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Reconnection</span>
            <span className="sm:hidden">Reconnect</span>
          </TabsTrigger>
          <TabsTrigger 
            value="situationships"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[100px] sm:min-w-0"
          >
            <span className="hidden sm:inline">Situationships</span>
            <span className="sm:hidden">Situations</span>
          </TabsTrigger>
          <TabsTrigger 
            value="dating"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Dating</span>
          </TabsTrigger>
          <TabsTrigger 
            value="crushes"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[70px] sm:min-w-0"
          >
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Crushes</span>
          </TabsTrigger>
          <TabsTrigger 
            value="high_risk"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[80px] sm:min-w-0"
          >
            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">High Risk</span>
            <span className="sm:hidden">Risk</span>
          </TabsTrigger>
          <TabsTrigger 
            value="rankings"
            className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0 min-w-[80px] sm:min-w-0"
          >
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Rankings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeFilter} className="mt-6" ref={relationshipsGridRef}>
          {/* Active Relationships Section */}
          {(activeFilter === 'all' || activeFilter === 'active') && activeRelationships.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-400" />
                Active Relationships
              </h2>
              {renderRelationshipCollection(activeRelationships)}
            </div>
          )}

          {/* Crushes Section */}
          {(activeFilter === 'all' || activeFilter === 'crushes') && crushes.length > 0 && (
            <div className={activeFilter === 'all' ? 'mb-8' : ''}>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-400" />
                Crushes & Interests
              </h2>
              {renderRelationshipCollection(crushes)}
            </div>
          )}

          {/* Past Relationships Section */}
          {(activeFilter === 'all' || activeFilter === 'past') && pastRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <span className="text-white/60">Past Relationships</span>
              </h2>
              {renderRelationshipCollection(pastRelationships)}
            </div>
          )}

          {/* Situationships Section */}
          {activeFilter === 'situationships' &&
            filteredRelationships.length > 0 &&
            renderRelationshipCollection(situationships)}

          {/* Dating Section */}
          {activeFilter === 'dating' &&
            datingRelationships.length > 0 &&
            renderRelationshipCollection(datingRelationships)}

          {/* No Contact Section */}
          {activeFilter === 'no_contact' && noContactRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-400" />
                No Contact
              </h2>
              {renderRelationshipCollection(noContactRelationships)}
            </div>
          )}

          {/* Reconnection Section */}
          {activeFilter === 'reconnection' && reconnectionRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-blue-400" />
                Possible Reconnection
              </h2>
              {renderRelationshipCollection(reconnectionRelationships)}
            </div>
          )}

          {/* High Risk Section */}
          {activeFilter === 'high_risk' && highRiskRelationships.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                High Risk / Needs Care
              </h2>
              {renderRelationshipCollection(highRiskRelationships)}
            </div>
          )}

          {/* Rankings Section */}
          {activeFilter === 'rankings' && (
            <RankingView />
          )}

          {/* Empty State */}
          {activeFilter !== 'rankings' && visibleRelationships.length === 0 && (
            <Card className="border-border/60 bg-black/40">
              <CardContent className="p-12 text-center">
                <Heart className="w-16 h-16 mx-auto mb-4 text-pink-400/30" />
                <h3 className="text-lg font-semibold text-white mb-2">No relationships found</h3>
                <p className="text-white/60 text-sm mb-4">
                  {searchTerm 
                    ? 'Try a different search term'
                    : 'Relationships are automatically detected from your conversations! Start chatting about someone you like.'}
                </p>
                {!searchTerm && (
                  <p className="text-white/40 text-xs">
                    Just mention them in chat and we'll track your relationship automatically
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Relationship Detail Modal */}
      {selectedRelationship && (
        <RelationshipDetailModal
          relationshipId={selectedRelationship}
          onClose={() => setSelectedRelationship(null)}
          onUpdate={() => {
            loadRelationships();
            setSelectedRelationship(null);
          }}
        />
      )}
      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onUpdate={() => {
            void loadRelationships();
            invalidateCache(selectedCharacter.id);
          }}
          relationship={relationships.find((rel) => (rel.character_id ?? rel.person_id) === selectedCharacter.id)}
          initialTab="info"
        />
      )}
    </div>
  );
};
