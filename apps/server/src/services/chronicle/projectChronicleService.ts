import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  FOUNDER_ENTITY,
  ORGANIZATION_ENTITY,
  PRODUCT_ENTITY,
  SEED_CHAPTERS,
  SEED_MILESTONES,
  SELF_NARRATIVE_CHAPTERS,
  STAGE,
  VISION_SNAPSHOTS,
} from './projectChronicleSeed';
import {
  ChronicleMilestone,
  DetectionSource,
  FounderStats,
  MilestoneCategory,
  MilestoneSignificance,
  PendingDetection,
  ProjectChronicleSnapshot,
  significanceToStars,
} from './projectChronicleTypes';

const REPO_ROOT = join(__dirname, '../../../../..');

/** In-memory fallback when DB tables are unavailable (tests, pre-migration). */
let memoryPending: PendingDetection[] = [];
let memoryCustomMilestones: ChronicleMilestone[] = [];
let lastRefreshedAt = new Date().toISOString();

const SIGNIFICANCE_KEYWORDS: Array<{ pattern: RegExp; significance: MilestoneSignificance; category: MilestoneCategory }> = [
  { pattern: /\b(breakthrough|transformational|architecture shift)\b/i, significance: MilestoneSignificance.TRANSFORMATIONAL, category: MilestoneCategory.ARCHITECTURE },
  { pattern: /\b(major refactor|provenance|identity integrity|narrative engine|orchestrat)\b/i, significance: MilestoneSignificance.MAJOR, category: MilestoneCategory.ARCHITECTURE },
  { pattern: /\b(feat|feature|launch|dashboard|timeline|chronicle)\b/i, significance: MilestoneSignificance.MODERATE, category: MilestoneCategory.NEW_CAPABILITY },
  { pattern: /\b(fix|typo|lint|style)\b/i, significance: MilestoneSignificance.TRIVIAL, category: MilestoneCategory.OTHER },
  { pattern: /\b(ui|ux|polish|mobile)\b/i, significance: MilestoneSignificance.MINOR, category: MilestoneCategory.UX_RELEASE },
];

function scoreCommitMessage(message: string): { significance: MilestoneSignificance; category: MilestoneCategory; confidence: number } {
  for (const rule of SIGNIFICANCE_KEYWORDS) {
    if (rule.pattern.test(message)) {
      const confidence = rule.significance >= MilestoneSignificance.MAJOR ? 0.82 : 0.65;
      return { significance: rule.significance, category: rule.category, confidence };
    }
  }
  return { significance: MilestoneSignificance.MINOR, category: MilestoneCategory.OTHER, confidence: 0.45 };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function parseGitCommits(limit = 30): Array<{ hash: string; date: string; message: string }> {
  try {
    const out = execSync(
      ['git', 'log', `-${limit}`, '--pretty=format:%H|%aI|%s'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 },
    );
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...rest] = line.split('|');
        return { hash: hash ?? '', date: date ?? new Date().toISOString(), message: rest.join('|') };
      });
  } catch {
    return [];
  }
}

function parseReadmeMission(): string | null {
  const readmePath = join(REPO_ROOT, 'README.md');
  if (!existsSync(readmePath)) return null;
  try {
    const content = readFileSync(readmePath, 'utf8');
    const taglineMatch = content.match(/\*\*(.+?)\*\*\s*\n\nLorekeeper is/m);
    return taglineMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

function buildFounderStats(milestones: ChronicleMilestone[]): FounderStats {
  return {
    entityId: FOUNDER_ENTITY.id,
    name: FOUNDER_ENTITY.name,
    featuresAuthored: 137,
    majorMilestones: milestones.filter((m) => m.significance >= MilestoneSignificance.MAJOR).length,
    transformationalChanges: milestones.filter((m) => m.significance === MilestoneSignificance.TRANSFORMATIONAL).length,
    visionUpdates: VISION_SNAPSHOTS.length,
  };
}

function mergeMilestones(...lists: ChronicleMilestone[][]): ChronicleMilestone[] {
  const bySlug = new Map<string, ChronicleMilestone>();
  for (const list of lists) {
    for (const m of list) {
      bySlug.set(m.slug, m);
    }
  }
  return [...bySlug.values()].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

async function loadDbMilestones(): Promise<ChronicleMilestone[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_chronicle_milestones')
      .select('*')
      .order('occurred_at', { ascending: false });
    if (error || !data?.length) return [];
    return data.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      occurredAt: row.occurred_at,
      significance: row.significance as MilestoneSignificance,
      category: row.category as MilestoneCategory,
      chapterId: row.chapter_id ?? undefined,
      source: row.source as DetectionSource | undefined,
      stars: significanceToStars(row.significance as MilestoneSignificance),
    }));
  } catch {
    return [];
  }
}

async function loadDbPending(): Promise<PendingDetection[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('project_chronicle_pending_detections')
      .select('*')
      .eq('status', 'pending')
      .order('detected_at', { ascending: false });
    if (error) return null;
    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      confidence: row.confidence,
      significance: row.significance as MilestoneSignificance,
      category: row.category as MilestoneCategory,
      source: row.source as DetectionSource,
      sourceRef: row.source_ref ?? undefined,
      detectedAt: row.detected_at,
      status: row.status as PendingDetection['status'],
    }));
  } catch {
    return null;
  }
}

async function persistPending(detections: PendingDetection[]): Promise<void> {
  if (!detections.length) return;
  try {
    const rows = detections.map((d) => ({
      id: d.id,
      title: d.title,
      summary: d.summary,
      confidence: d.confidence,
      significance: d.significance,
      category: d.category,
      source: d.source,
      source_ref: d.sourceRef ?? null,
      detected_at: d.detectedAt,
      status: d.status,
    }));
    await supabaseAdmin.from('project_chronicle_pending_detections').upsert(rows, { onConflict: 'id' });
  } catch (err) {
    logger.debug({ err }, 'Chronicle: pending detections DB write skipped');
  }
}

export function detectFromGitCommits(existingSlugs: Set<string>): PendingDetection[] {
  const commits = parseGitCommits(40);
  const detections: PendingDetection[] = [];

  for (const commit of commits) {
    const firstLine = commit.message.split('\n')[0]?.trim() ?? '';
    if (firstLine.length < 8) continue;
    const slug = slugify(`git-${firstLine}`);
    if (existingSlugs.has(slug)) continue;

    const { significance, category, confidence } = scoreCommitMessage(firstLine);
    if (significance <= MilestoneSignificance.MINOR && confidence < 0.6) continue;

    detections.push({
      id: `det-git-${commit.hash.slice(0, 8)}`,
      title: firstLine,
      summary: `Git commit ${commit.hash.slice(0, 7)} — potential project milestone.`,
      confidence,
      significance,
      category,
      source: DetectionSource.GIT_COMMIT,
      sourceRef: commit.hash,
      detectedAt: commit.date,
      status: 'pending',
    });
    existingSlugs.add(slug);
  }

  return detections.slice(0, 15);
}

export function detectFromReadme(existingTitles: Set<string>): PendingDetection | null {
  const tagline = parseReadmeMission();
  if (!tagline || existingTitles.has('readme-tagline')) return null;
  return {
    id: 'det-readme-tagline',
    title: 'README tagline sync',
    summary: `Landing/README mission: "${tagline}"`,
    confidence: 0.91,
    significance: MilestoneSignificance.MODERATE,
    category: MilestoneCategory.VISION,
    source: DetectionSource.README,
    sourceRef: 'README.md',
    detectedAt: new Date().toISOString(),
    status: 'pending',
  };
}

export async function refreshChronicleSources(): Promise<{ newDetections: number }> {
  const dbMilestones = await loadDbMilestones();
  const allMilestones = mergeMilestones(SEED_MILESTONES, dbMilestones, memoryCustomMilestones);
  const existingSlugs = new Set(allMilestones.map((m) => m.slug));
  const existingTitles = new Set(allMilestones.map((m) => m.title.toLowerCase()));

  const fromGit = detectFromGitCommits(new Set(existingSlugs));
  const fromReadme = detectFromReadme(existingTitles);
  const incoming = [...fromGit, ...(fromReadme ? [fromReadme] : [])];

  const dbPending = (await loadDbPending()) ?? memoryPending;
  const existingIds = new Set(dbPending.map((d) => d.id));
  const novel = incoming.filter((d) => !existingIds.has(d.id));

  if (novel.length) {
    memoryPending = [...novel, ...memoryPending].slice(0, 50);
    await persistPending(novel);
  }

  lastRefreshedAt = new Date().toISOString();
  return { newDetections: novel.length };
}

export async function acceptDetection(detectionId: string): Promise<ChronicleMilestone | null> {
  const dbPending = (await loadDbPending()) ?? memoryPending;
  const detection = dbPending.find((d) => d.id === detectionId);
  if (!detection) return null;

  const milestone: ChronicleMilestone = {
    id: `ms-${slugify(detection.title)}-${Date.now()}`,
    slug: slugify(detection.title),
    title: detection.title,
    summary: detection.summary,
    occurredAt: detection.detectedAt,
    significance: detection.significance,
    category: detection.category,
    source: detection.source,
    stars: significanceToStars(detection.significance),
  };

  memoryCustomMilestones.push(milestone);

  try {
    await supabaseAdmin.from('project_chronicle_milestones').upsert({
      id: milestone.id,
      slug: milestone.slug,
      title: milestone.title,
      summary: milestone.summary,
      occurred_at: milestone.occurredAt,
      significance: milestone.significance,
      category: milestone.category,
      source: milestone.source ?? DetectionSource.MANUAL,
    });
    await supabaseAdmin
      .from('project_chronicle_pending_detections')
      .update({ status: 'accepted' })
      .eq('id', detectionId);
  } catch {
    /* memory fallback */
  }

  memoryPending = memoryPending.filter((d) => d.id !== detectionId);
  return milestone;
}

export async function rejectDetection(detectionId: string): Promise<boolean> {
  const dbPending = (await loadDbPending()) ?? memoryPending;
  if (!dbPending.some((d) => d.id === detectionId)) return false;

  try {
    await supabaseAdmin
      .from('project_chronicle_pending_detections')
      .update({ status: 'rejected' })
      .eq('id', detectionId);
  } catch {
    /* memory fallback */
  }

  memoryPending = memoryPending.filter((d) => d.id !== detectionId);
  return true;
}

/** Test helper — reset in-memory state. */
export function resetChronicleMemoryState(): void {
  memoryPending = [];
  memoryCustomMilestones = [];
  lastRefreshedAt = new Date().toISOString();
}

export async function getProjectChronicle(options?: { refresh?: boolean }): Promise<ProjectChronicleSnapshot> {
  if (options?.refresh) {
    await refreshChronicleSources();
  }

  const dbMilestones = await loadDbMilestones();
  const milestones = mergeMilestones(SEED_MILESTONES, dbMilestones, memoryCustomMilestones);
  const leaderboard = [...milestones]
    .sort((a, b) => b.significance - a.significance || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 25);

  const pendingDetections = (await loadDbPending()) ?? memoryPending;

  const product = { ...PRODUCT_ENTITY };
  if (product.fields) {
    product.fields = {
      ...product.fields,
      tagline: parseReadmeMission() ?? (product.fields.tagline as string),
    };
  }

  return {
    product,
    organization: ORGANIZATION_ENTITY,
    founder: FOUNDER_ENTITY,
    stage: STAGE,
    visionEvolution: VISION_SNAPSHOTS,
    milestones,
    chapters: SEED_CHAPTERS,
    leaderboard,
    founderStats: buildFounderStats(milestones),
    selfNarrative: {
      title: 'The Story of LoreBook',
      subtitle: 'An autobiography written from evidence, milestones, and vision.',
      chapters: SELF_NARRATIVE_CHAPTERS,
    },
    pendingDetections: pendingDetections.filter((d) => d.status === 'pending'),
    lastRefreshedAt,
    generatedAt: new Date().toISOString(),
  };
}

/** Group milestones by month for timeline UI. */
export function groupMilestonesByMonth(milestones: ChronicleMilestone[]): Map<string, ChronicleMilestone[]> {
  const groups = new Map<string, ChronicleMilestone[]>();
  for (const m of milestones) {
    const d = new Date(m.occurredAt);
    const key = `${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  return groups;
}
