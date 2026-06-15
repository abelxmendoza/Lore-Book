import { useState, useEffect, useMemo } from 'react';
import {
  User, MapPin, Building2, Lightbulb, Sparkles, AlertCircle, Search,
  BookOpen, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Hash,
  Settings, Filter, X, Grid3x3, List, SlidersHorizontal, TrendingUp,
  Merge, RotateCcw, ArrowRight, Bot, Clock, History, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Modal } from '../ui/modal';
import { EntityProfileCard, type EntityCandidate } from './EntityProfileCard';
import {
  entityResolutionApi,
  type EntityConflict,
  type EntityMergeRecord,
  type EntityType,
} from '../../api/entityResolution';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { EntityDetailModal } from './EntityDetailModal';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { format, subDays, parseISO } from 'date-fns';

// ─── Constants ───────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 18;
const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

type SortOption = 'usage_desc' | 'usage_asc' | 'name_asc' | 'name_desc' | 'confidence_desc' | 'confidence_asc' | 'recent';
type ViewMode = 'grid' | 'list';
type EntityCategory = 'all' | 'people' | 'locations' | 'organizations' | 'concepts' | 'conflicts';
type HubTab = 'browse' | 'conflicts' | 'history';

// ─── Mock data ────────────────────────────────────────────────────────────────
//
// IDs are deterministic so MOCK_CONFLICTS and MOCK_MERGE_HISTORY can reference them.
// Order: CHARACTER (1-8) · LOCATION (9-14) · ORG (15-20) · PERSON (21-23)
//        CONCEPT (24-28) · ENTITY (29-32)
//
// Entities with conflicts: 1 (Alex), 5 (Michael), 9 (Coffee Shop), 10 (Central Park),
//                          15 (Tech Corp), 20 (Startup Inc), 21 (Dr. Smith), 22 (Prof Johnson)

const MOCK_ENTITY_DEFS: Array<{
  name: string; type: EntityType; aliases: string[];
  confidence: number; usage: number; daysAgo: number;
  visible: boolean; tier: 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
  hasConflict: boolean;
}> = [
  // CHARACTER (1–8)
  { name: 'Alex Morgan',       type: 'CHARACTER', aliases: ['Alex', 'A.M.'],         confidence: 0.95, usage: 42, daysAgo: 2,  visible: true,  tier: 'PRIMARY',   hasConflict: true  },
  { name: 'Sarah Chen',        type: 'CHARACTER', aliases: ['Sarah', 'S.C.'],         confidence: 0.91, usage: 38, daysAgo: 1,  visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'John Martinez',     type: 'CHARACTER', aliases: ['John', 'J.M.'],          confidence: 0.88, usage: 27, daysAgo: 5,  visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Emma Wilson',       type: 'CHARACTER', aliases: ['Emma', 'E.W.'],          confidence: 0.84, usage: 19, daysAgo: 9,  visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Michael Brown',     type: 'CHARACTER', aliases: ['Mike', 'M.B.'],          confidence: 0.79, usage: 15, daysAgo: 14, visible: true,  tier: 'PRIMARY',   hasConflict: true  },
  { name: 'Lisa Anderson',     type: 'CHARACTER', aliases: [],                        confidence: 0.76, usage: 11, daysAgo: 20, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'David Kim',         type: 'CHARACTER', aliases: [],                        confidence: 0.72, usage: 8,  daysAgo: 30, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Rachel Green',      type: 'CHARACTER', aliases: [],                        confidence: 0.68, usage: 6,  daysAgo: 45, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  // LOCATION (9–14)
  { name: 'Coffee Shop',       type: 'LOCATION',  aliases: ['Café', 'Coffee Place'],  confidence: 0.93, usage: 31, daysAgo: 3,  visible: true,  tier: 'PRIMARY',   hasConflict: true  },
  { name: 'Central Park',      type: 'LOCATION',  aliases: ['The Park', 'Park'],      confidence: 0.90, usage: 24, daysAgo: 7,  visible: true,  tier: 'PRIMARY',   hasConflict: true  },
  { name: 'Office Building',   type: 'LOCATION',  aliases: ['Work', 'The Office'],    confidence: 0.87, usage: 18, daysAgo: 4,  visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Beach House',       type: 'LOCATION',  aliases: ['The Beach', 'Shore'],    confidence: 0.81, usage: 9,  daysAgo: 21, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Mountain Trail',    type: 'LOCATION',  aliases: ['The Trail'],             confidence: 0.74, usage: 5,  daysAgo: 40, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Library',           type: 'LOCATION',  aliases: [],                        confidence: 0.71, usage: 4,  daysAgo: 55, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  // ORG (15–20)
  { name: 'Tech Corp',         type: 'ORG',       aliases: ['TC', 'The Company'],     confidence: 0.92, usage: 29, daysAgo: 6,  visible: true,  tier: 'PRIMARY',   hasConflict: true  },
  { name: 'Design Studio',     type: 'ORG',       aliases: ['The Studio', 'DS'],      confidence: 0.86, usage: 17, daysAgo: 11, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'University',        type: 'ORG',       aliases: ['The Uni', 'College'],    confidence: 0.83, usage: 14, daysAgo: 16, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Hospital',          type: 'ORG',       aliases: ['The Hospital'],          confidence: 0.80, usage: 10, daysAgo: 25, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Law Firm',          type: 'ORG',       aliases: [],                        confidence: 0.75, usage: 7,  daysAgo: 35, visible: true,  tier: 'PRIMARY',   hasConflict: false },
  { name: 'Startup Inc',       type: 'ORG',       aliases: ['The Startup'],           confidence: 0.69, usage: 5,  daysAgo: 50, visible: true,  tier: 'PRIMARY',   hasConflict: true  },
  // PERSON (21–23)
  { name: 'Dr. Smith',         type: 'PERSON',    aliases: ['Doc', 'Doctor Smith'],   confidence: 0.88, usage: 22, daysAgo: 8,  visible: false, tier: 'SECONDARY', hasConflict: true  },
  { name: 'Professor Johnson', type: 'PERSON',    aliases: ['Prof', 'Prof. Johnson'], confidence: 0.85, usage: 16, daysAgo: 12, visible: false, tier: 'SECONDARY', hasConflict: true  },
  { name: 'Nurse Williams',    type: 'PERSON',    aliases: ['Nurse'],                 confidence: 0.77, usage: 9,  daysAgo: 22, visible: false, tier: 'SECONDARY', hasConflict: false },
  // CONCEPT (24–28)
  { name: 'Friendship',        type: 'CONCEPT',   aliases: [],                        confidence: 0.82, usage: 20, daysAgo: 3,  visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Success',           type: 'CONCEPT',   aliases: ['Achievement'],           confidence: 0.78, usage: 15, daysAgo: 7,  visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Creativity',        type: 'CONCEPT',   aliases: [],                        confidence: 0.74, usage: 11, daysAgo: 13, visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Adventure',         type: 'CONCEPT',   aliases: ['Exploration'],           confidence: 0.70, usage: 8,  daysAgo: 19, visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Growth',            type: 'CONCEPT',   aliases: [],                        confidence: 0.66, usage: 6,  daysAgo: 28, visible: false, tier: 'TERTIARY',  hasConflict: false },
  // ENTITY generic (29–32)
  { name: 'Morning Routine',   type: 'ENTITY',    aliases: ['My Routine'],            confidence: 0.72, usage: 13, daysAgo: 4,  visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Project Phoenix',   type: 'ENTITY',    aliases: ['The Project'],           confidence: 0.80, usage: 18, daysAgo: 9,  visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Saturday Hike',     type: 'ENTITY',    aliases: ['The Hike'],              confidence: 0.67, usage: 5,  daysAgo: 36, visible: false, tier: 'TERTIARY',  hasConflict: false },
  { name: 'Team Meeting',      type: 'ENTITY',    aliases: ['The Meeting', 'Standup'],confidence: 0.76, usage: 21, daysAgo: 2,  visible: false, tier: 'TERTIARY',  hasConflict: false },
];

const now = new Date();
const MOCK_ENTITIES: EntityCandidate[] = MOCK_ENTITY_DEFS.map((def, i) => ({
  entity_id: `mock-entity-${i + 1}`,
  primary_name: def.name,
  aliases: def.aliases,
  entity_type: def.type,
  confidence: def.confidence,
  usage_count: def.usage,
  last_seen: subDays(now, def.daysAgo).toISOString(),
  source_table: def.type === 'PERSON' ? 'omega_entities' : def.type.toLowerCase() + 's',
  is_user_visible: def.visible,
  resolution_tier: def.tier,
  has_conflicts: def.hasConflict,
  conflict_count: def.hasConflict ? 1 : 0,
}));

// Conflicts reference the stable IDs above
// IDs: 1=Alex Morgan, 5=Michael Brown, 9=Coffee Shop, 10=Central Park,
//      15=Tech Corp, 20=Startup Inc, 21=Dr. Smith, 22=Prof Johnson
const MOCK_CONFLICTS: EntityConflict[] = [
  {
    id: 'mock-conflict-1',
    user_id: 'demo',
    entity_a_id: 'mock-entity-1',   // Alex Morgan
    entity_b_id: 'mock-entity-5',   // Michael Brown
    entity_a_type: 'CHARACTER',
    entity_b_type: 'CHARACTER',
    similarity_score: 0.82,
    conflict_reason: 'COREFERENCE',
    status: 'OPEN',
    detected_at: subDays(now, 3).toISOString(),
    resolved_at: null,
    metadata: {},
  },
  {
    id: 'mock-conflict-2',
    user_id: 'demo',
    entity_a_id: 'mock-entity-15',  // Tech Corp
    entity_b_id: 'mock-entity-20',  // Startup Inc
    entity_a_type: 'ORG',
    entity_b_type: 'ORG',
    similarity_score: 0.71,
    conflict_reason: 'CONTEXT_OVERLAP',
    status: 'OPEN',
    detected_at: subDays(now, 7).toISOString(),
    resolved_at: null,
    metadata: {},
  },
  {
    id: 'mock-conflict-3',
    user_id: 'demo',
    entity_a_id: 'mock-entity-21',  // Dr. Smith
    entity_b_id: 'mock-entity-22',  // Professor Johnson
    entity_a_type: 'PERSON',
    entity_b_type: 'PERSON',
    similarity_score: 0.88,
    conflict_reason: 'NAME_SIMILARITY',
    status: 'OPEN',
    detected_at: subDays(now, 1).toISOString(),
    resolved_at: null,
    metadata: {},
  },
  {
    id: 'mock-conflict-4',
    user_id: 'demo',
    entity_a_id: 'mock-entity-9',   // Coffee Shop
    entity_b_id: 'mock-entity-10',  // Central Park
    entity_a_type: 'LOCATION',
    entity_b_type: 'LOCATION',
    similarity_score: 0.64,
    conflict_reason: 'TEMPORAL_OVERLAP',
    status: 'OPEN',
    detected_at: subDays(now, 12).toISOString(),
    resolved_at: null,
    metadata: {},
  },
];

const MOCK_MERGE_HISTORY: EntityMergeRecord[] = [
  {
    id: 'mock-merge-1',
    user_id: 'demo',
    source_entity_id: 'mock-entity-7',  // David Kim
    target_entity_id: 'mock-entity-1',  // Alex Morgan
    source_entity_type: 'CHARACTER',
    target_entity_type: 'CHARACTER',
    merged_by: 'USER',
    reason: 'Same person — David Kim goes by Alex Morgan professionally.',
    created_at: subDays(now, 15).toISOString(),
    reversible: true,
    reverted_at: null,
    metadata: {},
  },
  {
    id: 'mock-merge-2',
    user_id: 'demo',
    source_entity_id: 'mock-entity-13', // Mountain Trail
    target_entity_id: 'mock-entity-12', // Beach House
    source_entity_type: 'LOCATION',
    target_entity_type: 'LOCATION',
    merged_by: 'SYSTEM',
    reason: 'High contextual overlap detected across 4 journal entries.',
    created_at: subDays(now, 22).toISOString(),
    reversible: true,
    reverted_at: null,
    metadata: {},
  },
  {
    id: 'mock-merge-3',
    user_id: 'demo',
    source_entity_id: 'mock-entity-19', // Law Firm
    target_entity_id: 'mock-entity-15', // Tech Corp
    source_entity_type: 'ORG',
    target_entity_type: 'ORG',
    merged_by: 'USER',
    reason: 'Confirmed same organization — they rebranded.',
    created_at: subDays(now, 40).toISOString(),
    reversible: false,
    reverted_at: null,
    metadata: {},
  },
  {
    id: 'mock-merge-4',
    user_id: 'demo',
    source_entity_id: 'mock-entity-4',  // Emma Wilson
    target_entity_id: 'mock-entity-8',  // Rachel Green
    source_entity_type: 'CHARACTER',
    target_entity_type: 'CHARACTER',
    merged_by: 'SYSTEM',
    reason: null,
    created_at: subDays(now, 60).toISOString(),
    reversible: true,
    reverted_at: subDays(now, 55).toISOString(),
    metadata: {},
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

function formatDateTime(d: string) {
  try { return format(parseISO(d), 'MMM d, yyyy HH:mm'); } catch { return d; }
}

const CONFLICT_REASON_LABEL: Record<string, string> = {
  NAME_SIMILARITY: 'Similar names',
  CONTEXT_OVERLAP: 'Context overlap',
  COREFERENCE: 'Coreference',
  TEMPORAL_OVERLAP: 'Temporal overlap',
};

// ─── Conflict card ────────────────────────────────────────────────────────────

interface ConflictCardProps {
  conflict: EntityConflict;
  entities: EntityCandidate[];
  onMerge: (conflict: EntityConflict) => void;
  onDismiss: (conflictId: string) => void;
  loading: boolean;
}

const ConflictCard = ({ conflict, entities, onMerge, onDismiss, loading }: ConflictCardProps) => {
  const nameA = entities.find(e => e.entity_id === conflict.entity_a_id)?.primary_name ?? conflict.entity_a_id.slice(0, 8) + '…';
  const nameB = entities.find(e => e.entity_id === conflict.entity_b_id)?.primary_name ?? conflict.entity_b_id.slice(0, 8) + '…';
  const similarity = Math.round(conflict.similarity_score * 100);

  return (
    <div className="border border-orange-500/30 rounded-xl bg-orange-500/5 p-4 space-y-3">
      {/* Header badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-orange-400 bg-orange-500/20 border border-orange-500/30 rounded-full px-2 py-0.5">
          {similarity}% similar
        </span>
        <span className="text-xs text-white/50 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
          {CONFLICT_REASON_LABEL[conflict.conflict_reason] ?? conflict.conflict_reason}
        </span>
        <span className="text-xs text-white/30 ml-auto">
          Detected {formatDate(conflict.detected_at)}
        </span>
      </div>

      {/* Entity comparison */}
      <div className="flex items-center gap-3">
        <div className="flex-1 p-3 rounded-lg bg-black/40 border border-white/10">
          <div className="text-sm font-semibold text-white">{nameA}</div>
          <div className="text-xs text-white/40 mt-0.5">{conflict.entity_a_type}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-white/20 shrink-0" />
        <div className="flex-1 p-3 rounded-lg bg-black/40 border border-white/10">
          <div className="text-sm font-semibold text-white">{nameB}</div>
          <div className="text-xs text-white/40 mt-0.5">{conflict.entity_b_type}</div>
        </div>
      </div>

      {/* Similarity bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full"
            style={{ width: `${similarity}%` }}
          />
        </div>
        <span className="text-xs text-white/40 w-8 text-right">{similarity}%</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMerge(conflict)}
          disabled={loading}
          className="text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
        >
          <Merge className="h-3 w-3 mr-1.5" />
          Merge
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDismiss(conflict.id)}
          disabled={loading}
          className="text-xs text-white/50 hover:text-white/80"
        >
          <X className="h-3 w-3 mr-1.5" />
          Not a duplicate
        </Button>
      </div>
    </div>
  );
};

// ─── Merge history row ────────────────────────────────────────────────────────

interface MergeRowProps {
  merge: EntityMergeRecord;
  entities: EntityCandidate[];
  onRevert: (mergeId: string) => void;
}

const MergeRow = ({ merge, entities, onRevert }: MergeRowProps) => {
  const sourceName = entities.find(e => e.entity_id === merge.source_entity_id)?.primary_name ?? merge.source_entity_id.slice(0, 8) + '…';
  const targetName = entities.find(e => e.entity_id === merge.target_entity_id)?.primary_name ?? merge.target_entity_id.slice(0, 8) + '…';

  return (
    <div className="border border-border/40 rounded-xl bg-black/30 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-sm font-semibold text-white truncate">{sourceName}</span>
          <ArrowRight className="h-3.5 w-3.5 text-white/30 shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{targetName}</span>
          {merge.merged_by === 'USER'
            ? <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30 bg-blue-500/10">You</Badge>
            : <Badge variant="outline" className="text-[10px] text-white/40 border-white/10"><Bot className="h-2.5 w-2.5 mr-1" />System</Badge>
          }
          {merge.reverted_at && (
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10">Reverted</Badge>
          )}
        </div>
        {merge.reversible && !merge.reverted_at && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRevert(merge.id)}
            className="text-xs shrink-0"
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Revert
          </Button>
        )}
      </div>

      {merge.reason && (
        <p className="text-xs text-white/50 italic">"{merge.reason}"</p>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-white/30">
        <Clock className="h-3 w-3" />
        <span>{formatDateTime(merge.created_at)}</span>
        <span className="text-white/15">·</span>
        <span>{merge.source_entity_type} → {merge.target_entity_type}</span>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const EntityResolutionBook: React.FC = () => {
  // ── Data ──
  const [entities, setEntities] = useState<EntityCandidate[]>([]);
  const [conflicts, setConflicts] = useState<EntityConflict[]>([]);
  const [mergeHistory, setMergeHistory] = useState<EntityMergeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Navigation ──
  const [activeTab, setActiveTab] = useState<HubTab>('browse');

  // ── Browse state ──
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<EntityCategory>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntityCandidate | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE);
  const [sortBy, setSortBy] = useState<SortOption>('usage_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [filterTypes, setFilterTypes] = useState<EntityType[]>([]);
  const [filterConfidenceMin, setFilterConfidenceMin] = useState(0);
  const [filterConfidenceMax, setFilterConfidenceMax] = useState(1);
  const [filterUsageMin, setFilterUsageMin] = useState(0);
  const [filterUsageMax, setFilterUsageMax] = useState(100);
  const [filterHasConflicts, setFilterHasConflicts] = useState<boolean | null>(null);

  // ── Conflict management state ──
  const [mergingConflict, setMergingConflict] = useState<EntityConflict | null>(null);
  const [mergeReason, setMergeReason] = useState('');

  const isMockDataEnabled = useShouldUseMockData();
  const { entries = [] } = useLoreKeeper();

  // ── Load data ──
  useEffect(() => {
    void loadData();
  }, [showAdvanced, isMockDataEnabled]);

  useEffect(() => {
    const cards = entries.map(e => memoryEntryToCard({
      id: e.id, date: e.date, content: e.content,
      summary: e.summary ?? null, tags: e.tags ?? [],
      mood: e.mood ?? null, chapter_id: e.chapter_id ?? null,
      source: e.source ?? 'manual', metadata: e.metadata ?? {},
    }));
    setAllMemories(cards);
  }, [entries]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    if (isMockDataEnabled) {
      setEntities(MOCK_ENTITIES);
      setConflicts(MOCK_CONFLICTS);
      setMergeHistory(MOCK_MERGE_HISTORY);
      setLoading(false);
      return;
    }

    try {
      const [entitiesData, conflictsData, historyData] = await Promise.all([
        entityResolutionApi.listEntities({
          include_secondary: showAdvanced,
          include_tertiary: showAdvanced,
        }),
        entityResolutionApi.listConflicts(),
        entityResolutionApi.listMergeHistory(),
      ]);

      // Mark entities with open conflicts
      const entityMap = new Map(entitiesData.map(e => [e.entity_id, { ...e, has_conflicts: false, conflict_count: 0 }]));
      conflictsData.filter(c => c.status === 'OPEN').forEach(conflict => {
        const a = entityMap.get(conflict.entity_a_id);
        const b = entityMap.get(conflict.entity_b_id);
        if (a) { a.has_conflicts = true; a.conflict_count = (a.conflict_count ?? 0) + 1; }
        if (b) { b.has_conflicts = true; b.conflict_count = (b.conflict_count ?? 0) + 1; }
      });

      setEntities(Array.from(entityMap.values()));
      setConflicts(conflictsData.filter(c => c.status === 'OPEN'));
      setMergeHistory(historyData);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load entities');
      setEntities([]);
    } finally {
      setLoading(false);
    }
  };

  // ── Conflict actions ──
  const handleMerge = async () => {
    if (!mergingConflict || !mergeReason.trim()) return;
    setActionLoading(true);
    try {
      await entityResolutionApi.mergeEntities(
        mergingConflict.entity_a_id,
        mergingConflict.entity_b_id,
        mergingConflict.entity_a_type,
        mergingConflict.entity_b_type,
        mergeReason,
      );
      setMergingConflict(null);
      setMergeReason('');
      void loadData();
    } catch (err: any) {
      alert(err.message ?? 'Failed to merge entities');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismiss = async (conflictId: string) => {
    if (!confirm('Mark these as NOT duplicates? This conflict won\'t appear again.')) return;
    setActionLoading(true);
    try {
      await entityResolutionApi.dismissConflict(conflictId);
      void loadData();
    } catch (err: any) {
      alert(err.message ?? 'Failed to dismiss conflict');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevert = async (mergeId: string) => {
    if (!confirm('Revert this merge? The source entity will be restored.')) return;
    setActionLoading(true);
    try {
      await entityResolutionApi.revertMerge(mergeId);
      void loadData();
    } catch (err: any) {
      alert(err.message ?? 'Failed to revert merge');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Browse: derived values ──
  const uniqueTypes = useMemo(() => Array.from(new Set(entities.map(e => e.entity_type))).sort(), [entities]);

  const filteredEntities = useMemo(() => {
    let filtered = showAdvanced ? [...entities] : entities.filter(e => e.is_user_visible);

    if (activeCategory !== 'all') {
      filtered = filtered.filter(e => {
        switch (activeCategory) {
          case 'people':        return e.entity_type === 'CHARACTER' || e.entity_type === 'PERSON';
          case 'locations':     return e.entity_type === 'LOCATION';
          case 'organizations': return e.entity_type === 'ORG';
          case 'concepts':      return e.entity_type === 'CONCEPT';
          case 'conflicts':     return e.has_conflicts === true;
          default:              return true;
        }
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.primary_name.toLowerCase().includes(term) ||
        e.aliases.some(a => a.toLowerCase().includes(term)) ||
        e.entity_type.toLowerCase().includes(term)
      );
    }

    if (filterTypes.length > 0) filtered = filtered.filter(e => filterTypes.includes(e.entity_type));
    if (filterHasConflicts !== null) filtered = filtered.filter(e => !!e.has_conflicts === filterHasConflicts);
    filtered = filtered.filter(e => e.confidence >= filterConfidenceMin && e.confidence <= filterConfidenceMax);
    filtered = filtered.filter(e => e.usage_count >= filterUsageMin && e.usage_count <= filterUsageMax);

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'usage_desc':      return (a.has_conflicts && !b.has_conflicts) ? -1 : (!a.has_conflicts && b.has_conflicts) ? 1 : b.usage_count - a.usage_count;
        case 'usage_asc':       return a.usage_count - b.usage_count;
        case 'name_asc':        return a.primary_name.localeCompare(b.primary_name);
        case 'name_desc':       return b.primary_name.localeCompare(a.primary_name);
        case 'confidence_desc': return b.confidence - a.confidence;
        case 'confidence_asc':  return a.confidence - b.confidence;
        case 'recent':          return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        default:                return 0;
      }
    });

    return filtered;
  }, [entities, searchTerm, activeCategory, showAdvanced, filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, filterHasConflicts, sortBy]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filterTypes.length > 0) c++;
    if (filterConfidenceMin > 0 || filterConfidenceMax < 1) c++;
    if (filterUsageMin > 0 || filterUsageMax < 100) c++;
    if (filterHasConflicts !== null) c++;
    return c;
  }, [filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, filterHasConflicts]);

  const clearFilters = () => {
    setFilterTypes([]);
    setFilterConfidenceMin(0);
    setFilterConfidenceMax(1);
    setFilterUsageMin(0);
    setFilterUsageMax(100);
    setFilterHasConflicts(null);
  };

  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeCategory, showAdvanced, filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, filterHasConflicts, sortBy]);

  const totalPages = Math.ceil(filteredEntities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedEntities = filteredEntities.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && currentPage > 1) { e.preventDefault(); setCurrentPage(p => p - 1); }
      else if (e.key === 'ArrowRight' && currentPage < totalPages) { e.preventDefault(); setCurrentPage(p => p + 1); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentPage, totalPages]);

  // ── Error state ──
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button onClick={() => void loadData()} variant="outline" size="sm">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-5">

      {/* ── Top-level tab switcher ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-black/30 border border-border/40 rounded-xl w-fit">
        {([
          { id: 'browse',    label: 'Browse',    icon: BookOpen,  badge: null },
          { id: 'conflicts', label: 'Conflicts', icon: AlertTriangle, badge: conflicts.length > 0 ? conflicts.length : null },
          { id: 'history',   label: 'History',   icon: History,   badge: mergeHistory.length > 0 ? mergeHistory.length : null },
        ] as const).map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {badge !== null && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none ${
                id === 'conflicts'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-white/10 text-white/50'
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
          className="ml-1 h-7 px-2 text-white/40 hover:text-white/70"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* BROWSE TAB                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          {/* Search + Controls row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="text"
                placeholder="Search by name, alias, or type…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="h-9 px-2 bg-black/40 border border-border/50 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="usage_desc">Most Used</option>
                <option value="usage_asc">Least Used</option>
                <option value="name_asc">A → Z</option>
                <option value="name_desc">Z → A</option>
                <option value="confidence_desc">High Confidence</option>
                <option value="confidence_asc">Low Confidence</option>
                <option value="recent">Recently Seen</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`text-xs ${activeFilterCount > 0 ? 'border-primary/50 bg-primary/10' : ''}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-primary text-white text-[10px] rounded-full leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <select
                value={itemsPerPage}
                onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="hidden sm:block h-9 px-2 bg-black/40 border border-border/50 rounded-lg text-white text-xs focus:outline-none"
              >
                {ITEMS_PER_PAGE_OPTIONS.map(o => <option key={o} value={o}>{o} / page</option>)}
              </select>

              <div className="flex items-center gap-0.5 bg-black/40 border border-border/50 rounded-lg p-1">
                {(['grid', 'list'] as const).map(mode => (
                  <Button
                    key={mode}
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode(mode)}
                    className={`h-7 px-2 ${viewMode === mode ? 'bg-primary/20 text-primary' : 'text-white/60'}`}
                  >
                    {mode === 'grid' ? <Grid3x3 className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Category tabs */}
          <Tabs value={activeCategory} onValueChange={v => setActiveCategory(v as EntityCategory)}>
            <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex flex-wrap gap-1 justify-center sm:justify-start">
              {(([
                { value: 'all',           icon: Hash,          label: 'All',       badge: undefined },
                { value: 'people',        icon: User,          label: 'People',    badge: undefined },
                { value: 'locations',     icon: MapPin,        label: 'Locations', badge: undefined },
                { value: 'organizations', icon: Building2,     label: 'Orgs',      badge: undefined },
                { value: 'concepts',      icon: Lightbulb,     label: 'Concepts',  badge: undefined },
                { value: 'conflicts',     icon: AlertTriangle, label: 'Conflicts', badge: conflicts.length > 0 ? conflicts.length : undefined },
              ]) as Array<{ value: EntityCategory; icon: React.ComponentType<{ className?: string }>; label: string; badge: number | undefined }>).map(({ value, icon: Icon, label, badge }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="flex items-center gap-1.5 text-xs flex-shrink-0 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-0.5 px-1 bg-orange-500/30 text-orange-400 rounded text-[10px]">
                      {badge}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Advanced filters panel */}
          {showFilters && (
            <Card className="bg-black/60 border border-primary/30">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-white">Advanced Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="text-xs text-white/50">({activeFilterCount} active)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                      <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs text-red-400 border-red-500/30">
                        <X className="h-3 w-3 mr-1" />Clear
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)} className="h-7 w-7 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {/* Type filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Entity Type</label>
                    <div className="space-y-1 p-2 bg-black/40 rounded-lg border border-border/30 max-h-36 overflow-y-auto">
                      {uniqueTypes.map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white/5">
                          <input
                            type="checkbox"
                            checked={filterTypes.includes(type)}
                            onChange={e => setFilterTypes(e.target.checked ? [...filterTypes, type] : filterTypes.filter(t => t !== type))}
                            className="rounded text-primary"
                          />
                          <span className="text-xs text-white/80 capitalize">{type.toLowerCase()}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Confidence filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />Confidence
                    </label>
                    <div className="space-y-2 p-2 bg-black/40 rounded-lg border border-border/30">
                      <div className="flex justify-between text-xs text-white/50">
                        <span>Min: {Math.round(filterConfidenceMin * 100)}%</span>
                        <span>Max: {Math.round(filterConfidenceMax * 100)}%</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={filterConfidenceMin} onChange={e => setFilterConfidenceMin(parseFloat(e.target.value))} className="w-full accent-primary" />
                      <input type="range" min="0" max="1" step="0.05" value={filterConfidenceMax} onChange={e => setFilterConfidenceMax(parseFloat(e.target.value))} className="w-full accent-primary" />
                    </div>
                  </div>

                  {/* Conflicts filter */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />Conflicts
                    </label>
                    <div className="space-y-1 p-2 bg-black/40 rounded-lg border border-border/30">
                      <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white/5">
                        <input type="checkbox" checked={filterHasConflicts === true} onChange={e => setFilterHasConflicts(e.target.checked ? true : null)} className="rounded text-primary" />
                        <span className="text-xs text-white/80">Has conflicts</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white/5">
                        <input type="checkbox" checked={filterHasConflicts === false} onChange={e => setFilterHasConflicts(e.target.checked ? false : null)} className="rounded text-primary" />
                        <span className="text-xs text-white/80">No conflicts</span>
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Count row */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/50">
              {loading ? 'Loading…' : (
                <>
                  {startIndex + 1}–{Math.min(startIndex + itemsPerPage, filteredEntities.length)} of {filteredEntities.length} entities
                  {filteredEntities.length !== entities.length && <span className="text-primary ml-1.5">({entities.length} total)</span>}
                </>
              )}
            </p>
            <Button
              variant={showAdvanced ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`text-xs ${showAdvanced ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : ''}`}
            >
              <Settings className="h-3 w-3 mr-1.5" />
              {showAdvanced ? 'Advanced Mode On' : 'Show All Tiers'}
            </Button>
          </div>

          {/* Grid / list */}
          {loading ? (
            <div className={`grid gap-3 ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1'}`}>
              {Array.from({ length: itemsPerPage }).map((_, i) => (
                <div key={i} className="h-48 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-white/20" />
              <p className="text-white/50 font-medium">No entities found</p>
              <p className="text-xs text-white/30 mt-1">Try a different search term or category</p>
            </div>
          ) : (
            <>
              {/* Book container */}
              <div className="relative bg-gradient-to-br from-indigo-50/5 via-purple-100/5 to-pink-50/5 rounded-xl border-2 border-indigo-800/30 overflow-hidden">
                {/* Book binding lines */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-900/40 via-indigo-800/30 to-indigo-900/40" />
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-900/40 via-indigo-800/30 to-indigo-900/40" />

                <div className="p-4 sm:p-6">
                  {/* Page header */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-800/20">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-indigo-600/60" />
                      <span className="text-xs text-indigo-700/50 font-mono">Page {currentPage}/{totalPages}</span>
                    </div>
                    <span className="text-[10px] text-indigo-700/40 font-mono">
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  {/* Entity grid/list */}
                  <div className={`grid gap-3 mb-5 ${
                    viewMode === 'grid'
                      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                      : 'grid-cols-1'
                  }`}>
                    {paginatedEntities.map((entity, i) => (
                      <EntityProfileCard
                        key={entity.entity_id ?? `e-${i}`}
                        entity={entity}
                        onClick={() => setSelectedEntity(entity)}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-indigo-800/20">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="text-indigo-700/60 hover:text-indigo-500 disabled:opacity-30 w-full sm:w-auto text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />Previous
                    </Button>

                    <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-indigo-800/30">
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        const p = totalPages <= 7 ? i + 1 : currentPage <= 4 ? i + 1 : currentPage >= totalPages - 3 ? totalPages - 6 + i : currentPage - 3 + i;
                        return (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p)}
                            className={`px-2 py-0.5 rounded text-xs transition ${currentPage === p ? 'bg-indigo-600 text-white' : 'text-indigo-700/60 hover:text-indigo-500 hover:bg-indigo-500/10'}`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="text-indigo-700/60 hover:text-indigo-500 disabled:opacity-30 w-full sm:w-auto text-xs"
                    >
                      Next<ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CONFLICTS TAB                                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Possible Duplicates</h2>
            <p className="text-sm text-white/50 mt-0.5">
              LoreBook detected these as potential duplicates. Merge them or mark as distinct.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />)}
            </div>
          ) : conflicts.length === 0 ? (
            <div className="text-center py-16 border border-border/40 rounded-xl bg-black/20">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-400/50" />
              <p className="text-white/50 font-medium">No conflicts found</p>
              <p className="text-xs text-white/30 mt-1">All entities appear to be distinct.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map(conflict => (
                <ConflictCard
                  key={conflict.id}
                  conflict={conflict}
                  entities={entities}
                  onMerge={c => { setMergingConflict(c); setMergeReason(''); }}
                  onDismiss={handleDismiss}
                  loading={actionLoading}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* HISTORY TAB                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Merge History</h2>
            <p className="text-sm text-white/50 mt-0.5">
              Every merge is logged and reversible. Nothing disappears without a trace.
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
            </div>
          ) : mergeHistory.length === 0 ? (
            <div className="text-center py-16 border border-border/40 rounded-xl bg-black/20">
              <History className="h-12 w-12 mx-auto mb-3 text-white/20" />
              <p className="text-white/50 font-medium">No merges yet</p>
              <p className="text-xs text-white/30 mt-1">Merge history will appear here when entities are combined.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mergeHistory.map(merge => (
                <MergeRow
                  key={merge.id}
                  merge={merge}
                  entities={entities}
                  onRevert={handleRevert}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Merge modal ─────────────────────────────────────────────────── */}
      {mergingConflict && (
        <Modal
          isOpen
          onClose={() => { setMergingConflict(null); setMergeReason(''); }}
          title="Merge Entities"
        >
          <div className="space-y-4">
            <p className="text-sm text-white/70">
              All references to the first entity will be redirected to the second. This is reversible from the History tab.
            </p>

            {/* Entity preview */}
            <div className="flex items-center gap-3 p-3 bg-black/30 rounded-lg border border-border/40">
              <div className="flex-1 text-sm">
                <div className="font-semibold text-white">
                  {entities.find(e => e.entity_id === mergingConflict.entity_a_id)?.primary_name ?? mergingConflict.entity_a_id.slice(0, 8)}
                </div>
                <div className="text-xs text-white/40">{mergingConflict.entity_a_type}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-white">
                  {entities.find(e => e.entity_id === mergingConflict.entity_b_id)?.primary_name ?? mergingConflict.entity_b_id.slice(0, 8)}
                </div>
                <div className="text-xs text-white/40">{mergingConflict.entity_b_type}</div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Reason <span className="text-white/40 font-normal">(required)</span>
              </label>
              <Input
                value={mergeReason}
                onChange={e => setMergeReason(e.target.value)}
                placeholder="e.g. Same person referred to differently"
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => { setMergingConflict(null); setMergeReason(''); }}>
                Cancel
              </Button>
              <Button onClick={handleMerge} disabled={!mergeReason.trim() || actionLoading}>
                {actionLoading ? 'Merging…' : 'Merge Entities'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Entity detail modal (Browse tab click-through) ──────────────── */}
      {selectedEntity && (
        <EntityDetailModal
          entity={selectedEntity}
          conflicts={conflicts.filter(c => c.entity_a_id === selectedEntity.entity_id || c.entity_b_id === selectedEntity.entity_id)}
          onClose={() => { setSelectedEntity(null); void loadData(); }}
        />
      )}

      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={id => { const m = allMemories.find(x => x.id === id); if (m) setSelectedMemory(m); }}
          allMemories={allMemories}
        />
      )}
    </div>
  );
};
