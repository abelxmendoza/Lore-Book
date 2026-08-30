import { supabaseAdmin } from '../supabaseClient';

type StorylineRow = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  domain?: string | null;
  primary_subject?: string | null;
  time_start: string | null;
  time_end: string | null;
  scene_ids: string[];
  event_ids: string[];
  significance_score: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  life_chapter_id?: string | null;
  era_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type LifeChapterRow = {
  id: string;
  user_id: string;
  domain: string;
  title: string;
  summary: string;
  time_start: string | null;
  time_end: string | null;
  storyline_ids: string[];
  scene_ids: string[];
  event_ids: string[];
  confidence: number;
  created_at: string;
  updated_at: string;
  era_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type EraRow = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  time_start: string | null;
  time_end: string | null;
  chapter_ids: string[];
  scene_ids: string[];
  event_ids: string[];
  confidence: number;
  created_at: string;
  updated_at: string;
  is_current: boolean;
  metadata?: Record<string, unknown> | null;
};

export type NarrativeProjectionFindingKind =
  | 'duplicate_storyline'
  | 'duplicate_life_chapter'
  | 'duplicate_life_era'
  | 'stale_storyline_membership'
  | 'stale_life_chapter_membership';

export type NarrativeProjectionFinding = {
  kind: NarrativeProjectionFindingKind;
  id: string;
  relatedId?: string;
  table: 'narrative_story_chapters' | 'narrative_life_chapters' | 'narrative_life_eras';
  label: string;
  reason: string;
  reversible: true;
};

export type NarrativeProjectionRepairReport = {
  userId: string;
  generatedAt: string;
  findings: NarrativeProjectionFinding[];
  counts: Record<NarrativeProjectionFindingKind, number>;
  metrics: {
    storylinesScanned: number;
    lifeChaptersScanned: number;
    erasScanned: number;
    storylineClusters: number;
    lifeChapterClusters: number;
    eraClusters: number;
  };
};

const emptyCounts = (): NarrativeProjectionRepairReport['counts'] => ({
  duplicate_storyline: 0,
  duplicate_life_chapter: 0,
  duplicate_life_era: 0,
  stale_storyline_membership: 0,
  stale_life_chapter_membership: 0,
});

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length > 1));
}

function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rangesOverlap(
  leftStart: string | null,
  leftEnd: string | null,
  rightStart: string | null,
  rightEnd: string | null,
): boolean {
  const a = dateMs(leftStart);
  const b = dateMs(leftEnd ?? leftStart);
  const c = dateMs(rightStart);
  const d = dateMs(rightEnd ?? rightStart);
  if (a == null || b == null || c == null || d == null) return false;
  return Math.max(a, c) <= Math.min(b, d);
}

function storylineDomain(row: StorylineRow): string {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const ownership = metadata.ownership;
  if (ownership && typeof ownership === 'object' && typeof (ownership as Record<string, unknown>).domain === 'string') {
    return normalize((ownership as Record<string, unknown>).domain as string);
  }
  return normalize(row.domain);
}

function duplicateStoryline(left: StorylineRow, right: StorylineRow): boolean {
  const leftDomain = storylineDomain(left);
  const rightDomain = storylineDomain(right);
  if (leftDomain && rightDomain && leftDomain !== rightDomain) return false;
  const sharedScenes = jaccard(left.scene_ids ?? [], right.scene_ids ?? []);
  const sharedEvents = jaccard(left.event_ids ?? [], right.event_ids ?? []);
  const sameSubject =
    normalize(left.primary_subject) !== '' &&
    normalize(left.primary_subject) === normalize(right.primary_subject);
  const sameTitle = normalize(left.title) === normalize(right.title);
  const titleSimilarity = jaccard(tokenSet(left.title), tokenSet(right.title));
  const sameWindow = rangesOverlap(left.time_start, left.time_end, right.time_start, right.time_end);

  return (
    sharedScenes >= 0.5 ||
    sharedEvents >= 0.5 ||
    (sameWindow && (sameSubject || (sameTitle && (sharedScenes > 0 || sharedEvents > 0)) || titleSimilarity >= 0.8))
  );
}

function duplicateLifeChapter(left: LifeChapterRow, right: LifeChapterRow): boolean {
  if (normalize(left.domain) !== normalize(right.domain)) return false;
  const sharedStorylines = jaccard(left.storyline_ids ?? [], right.storyline_ids ?? []);
  const sharedScenes = jaccard(left.scene_ids ?? [], right.scene_ids ?? []);
  const sharedEvents = jaccard(left.event_ids ?? [], right.event_ids ?? []);
  const sameTitle = normalize(left.title) === normalize(right.title);
  return (
    sharedStorylines >= 0.5 ||
    sharedScenes >= 0.5 ||
    sharedEvents >= 0.5 ||
    (sameTitle && rangesOverlap(left.time_start, left.time_end, right.time_start, right.time_end))
  );
}

function duplicateEra(left: EraRow, right: EraRow): boolean {
  const sharedChapters = jaccard(left.chapter_ids ?? [], right.chapter_ids ?? []);
  const sharedScenes = jaccard(left.scene_ids ?? [], right.scene_ids ?? []);
  const sharedEvents = jaccard(left.event_ids ?? [], right.event_ids ?? []);
  const titleSimilarity = jaccard(tokenSet(left.title), tokenSet(right.title));
  return (
    sharedChapters >= 0.5 ||
    sharedScenes >= 0.5 ||
    sharedEvents >= 0.5 ||
    (titleSimilarity >= 0.8 && rangesOverlap(left.time_start, left.time_end, right.time_start, right.time_end))
  );
}

function findClusters<T extends { id: string }>(
  rows: T[],
  areDuplicates: (left: T, right: T) => boolean,
): T[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (const row of rows) parent.set(row.id, row.id);
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (areDuplicates(rows[i], rows[j])) union(rows[i].id, rows[j].id);
    }
  }

  const clusters = new Map<string, T[]>();
  for (const row of rows) {
    const root = find(row.id);
    const cluster = clusters.get(root);
    if (cluster) cluster.push(row);
    else clusters.set(root, [row]);
  }
  return [...clusters.values()].filter((cluster) => cluster.length > 1);
}

function survivorId<T extends { id: string; confidence: number; significance_score?: number; updated_at: string }>(
  rows: T[],
): string {
  return [...rows]
    .sort(
      (left, right) =>
        (right.significance_score ?? 0) - (left.significance_score ?? 0) ||
        right.confidence - left.confidence ||
        right.updated_at.localeCompare(left.updated_at) ||
        left.id.localeCompare(right.id),
    )[0].id;
}

export function auditNarrativeProjectionRows(input: {
  userId: string;
  storylines?: StorylineRow[];
  lifeChapters?: LifeChapterRow[];
  eras?: EraRow[];
}): NarrativeProjectionRepairReport {
  const findings: NarrativeProjectionFinding[] = [];
  const storylines = input.storylines ?? [];
  const lifeChapters = input.lifeChapters ?? [];
  const eras = input.eras ?? [];
  const addClusterFindings = <T extends { id: string; title: string; confidence: number; updated_at: string; significance_score?: number }>(
    clusters: T[][],
    kind: NarrativeProjectionFindingKind,
    table: NarrativeProjectionFinding['table'],
  ) => {
    for (const cluster of clusters) {
      const survivor = survivorId(cluster);
      for (const row of cluster) {
        if (row.id === survivor) continue;
        findings.push({
          kind,
          id: row.id,
          relatedId: survivor,
          table,
          label: row.title,
          reason: `Overlaps canonical projection row ${survivor} by title, membership, and/or time window.`,
          reversible: true,
        });
      }
    }
  };

  addClusterFindings(
    findClusters(storylines, duplicateStoryline),
    'duplicate_storyline',
    'narrative_story_chapters',
  );
  addClusterFindings(
    findClusters(lifeChapters, duplicateLifeChapter),
    'duplicate_life_chapter',
    'narrative_life_chapters',
  );
  addClusterFindings(
    findClusters(eras, duplicateEra),
    'duplicate_life_era',
    'narrative_life_eras',
  );

  const storylineIds = new Set(storylines.map((row) => row.id));
  for (const chapter of lifeChapters) {
    for (const storylineId of chapter.storyline_ids ?? []) {
      if (!storylineIds.has(storylineId)) {
        findings.push({
          kind: 'stale_life_chapter_membership',
          id: chapter.id,
          table: 'narrative_life_chapters',
          label: chapter.title,
          reason: `References missing storyline ${storylineId}.`,
          reversible: true,
        });
      }
    }
  }

  const lifeChapterIds = new Set(lifeChapters.map((row) => row.id));
  for (const era of eras) {
    for (const chapterId of era.chapter_ids ?? []) {
      if (!lifeChapterIds.has(chapterId)) {
        const pointsToStoryline = storylineIds.has(chapterId);
        findings.push({
          kind: 'stale_storyline_membership',
          id: era.id,
          table: 'narrative_life_eras',
          label: era.title,
          reason: pointsToStoryline
            ? `Contains storyline ID ${chapterId}; eras must reference narrative_life_chapters IDs.`
            : `References missing life chapter ${chapterId}.`,
          reversible: true,
        });
      }
    }
  }

  const counts = emptyCounts();
  for (const finding of findings) counts[finding.kind] += 1;
  return {
    userId: input.userId,
    generatedAt: new Date().toISOString(),
    findings,
    counts,
    metrics: {
      storylinesScanned: storylines.length,
      lifeChaptersScanned: lifeChapters.length,
      erasScanned: eras.length,
      storylineClusters: findClusters(storylines, duplicateStoryline).length,
      lifeChapterClusters: findClusters(lifeChapters, duplicateLifeChapter).length,
      eraClusters: findClusters(eras, duplicateEra).length,
    },
  };
}

export class NarrativeProjectionRepairService {
  async auditUser(userId: string): Promise<NarrativeProjectionRepairReport> {
    const [storylines, lifeChapters, eras] = await Promise.all([
      supabaseAdmin
        .from('narrative_story_chapters')
        .select(
          'id,user_id,title,summary,primary_subject,time_start,time_end,scene_ids,event_ids,significance_score,confidence,created_at,updated_at,life_chapter_id,era_id,metadata',
        )
        .eq('user_id', userId)
        .limit(5000),
      supabaseAdmin
        .from('narrative_life_chapters')
        .select(
          'id,user_id,domain,title,summary,time_start,time_end,storyline_ids,scene_ids,event_ids,confidence,created_at,updated_at,era_id,metadata',
        )
        .eq('user_id', userId)
        .limit(2000),
      supabaseAdmin
        .from('narrative_life_eras')
        .select(
          'id,user_id,title,summary,time_start,time_end,chapter_ids,scene_ids,event_ids,confidence,created_at,updated_at,is_current,metadata',
        )
        .eq('user_id', userId)
        .limit(500),
    ]);
    const failed = [storylines, lifeChapters, eras].find((result) => result.error);
    if (failed?.error) throw failed.error;
    return auditNarrativeProjectionRows({
      userId,
      storylines: (storylines.data ?? []) as StorylineRow[],
      lifeChapters: (lifeChapters.data ?? []) as LifeChapterRow[],
      eras: (eras.data ?? []) as EraRow[],
    });
  }
}

export const narrativeProjectionRepairService = new NarrativeProjectionRepairService();
