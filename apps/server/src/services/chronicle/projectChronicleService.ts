import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  CHRONICLE_BACKGROUND_REFRESH_MS,
  MAX_AUTO_PROMOTES_PER_WEEK,
  MAX_PENDING_QUEUE,
  MIN_AUTO_PROMOTE_CONFIDENCE,
} from './projectChroniclePolicy';
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
import {
  scoreMajorCommitMessage,
  shouldAutoPromote,
  shouldQueuePending,
  verifyDetection,
} from './projectChronicleVerification';

const REPO_ROOT = join(__dirname, '../../../../..');

let memoryPending: PendingDetection[] = [];
let memoryCustomMilestones: ChronicleMilestone[] = [];
let lastRefreshedAt = new Date().toISOString();
let lastBackgroundRefreshAttempt = 0;
let lastAutoPromotedAt: string | undefined;
const memoryAutoPromoteTimestamps: string[] = [];

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

function enrichPending(detection: PendingDetection): PendingDetection {
  const verification = verifyDetection(detection);
  return {
    ...detection,
    verified: verification.confirmed,
    verificationScore: verification.score,
    verificationReasons: verification.reasons,
  };
}

function autoPromotesThisWeek(): number {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return memoryAutoPromoteTimestamps.filter((t) => new Date(t).getTime() >= weekAgo).length;
}

function recordAutoPromote(iso: string): void {
  lastAutoPromotedAt = iso;
  memoryAutoPromoteTimestamps.push(iso);
  while (memoryAutoPromoteTimestamps.length > 20) memoryAutoPromoteTimestamps.shift();
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

async function persistMilestone(milestone: ChronicleMilestone): Promise<void> {
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
  } catch {
    /* memory fallback */
  }
}

function milestoneFromDetection(detection: PendingDetection): ChronicleMilestone {
  return {
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
}

/** Major git commits only — minor work is intentionally excluded. */
export function detectFromGitCommits(existingSlugs: Set<string>): PendingDetection[] {
  const commits = parseGitCommits(50);
  const detections: PendingDetection[] = [];

  for (const commit of commits) {
    const firstLine = commit.message.split('\n')[0]?.trim() ?? '';
    const score = scoreMajorCommitMessage(firstLine);
    if (!score) continue;

    const slug = slugify(`git-${firstLine}`);
    if (existingSlugs.has(slug)) continue;

    const candidate: PendingDetection = {
      id: `det-git-${commit.hash.slice(0, 8)}`,
      title: firstLine,
      summary: `Verified major change from commit ${commit.hash.slice(0, 7)}.`,
      confidence: score.confidence,
      significance: score.significance,
      category: score.category,
      source: DetectionSource.GIT_COMMIT,
      sourceRef: commit.hash,
      detectedAt: commit.date,
      status: 'pending',
    };

    const verification = verifyDetection(candidate);
    if (!shouldQueuePending(candidate, verification)) continue;

    detections.push(enrichPending(candidate));
    existingSlugs.add(slug);
  }

  return detections.slice(0, MAX_PENDING_QUEUE);
}

export async function refreshChronicleSources(): Promise<{
  newDetections: number;
  autoPromoted: number;
}> {
  const dbMilestones = await loadDbMilestones();
  const allMilestones = mergeMilestones(SEED_MILESTONES, dbMilestones, memoryCustomMilestones);
  const existingSlugs = new Set(allMilestones.map((m) => m.slug));

  const fromGit = detectFromGitCommits(new Set(existingSlugs));
  const dbPending = (await loadDbPending()) ?? memoryPending;
  const existingIds = new Set(dbPending.map((d) => d.id));
  const novel = fromGit.filter((d) => !existingIds.has(d.id));

  let autoPromoted = 0;
  const toQueue: PendingDetection[] = [];
  const canAutoPromote = autoPromotesThisWeek() < MAX_AUTO_PROMOTES_PER_WEEK;

  for (const det of novel) {
    const verification = verifyDetection(det);
    if (canAutoPromote && shouldAutoPromote(det, verification)) {
      const milestone = milestoneFromDetection(det);
      memoryCustomMilestones.push(milestone);
      await persistMilestone(milestone);
      recordAutoPromote(new Date().toISOString());
      autoPromoted += 1;
      logger.info(
        { title: det.title, significance: det.significance, score: verification.score },
        'Chronicle: auto-promoted verified major milestone',
      );
      try {
        await supabaseAdmin
          .from('project_chronicle_pending_detections')
          .update({ status: 'accepted' })
          .eq('id', det.id);
      } catch {
        /* optional */
      }
      continue;
    }

    toQueue.push(enrichPending(det));
  }

  if (toQueue.length) {
    const merged = [...toQueue, ...memoryPending.filter((d) => !toQueue.some((n) => n.id === d.id))];
    memoryPending = merged.slice(0, MAX_PENDING_QUEUE);
    await persistPending(toQueue);
  }

  lastRefreshedAt = new Date().toISOString();
  return { newDetections: toQueue.length, autoPromoted };
}

export async function acceptDetection(detectionId: string): Promise<ChronicleMilestone | null> {
  const dbPending = (await loadDbPending()) ?? memoryPending;
  const detection = dbPending.find((d) => d.id === detectionId);
  if (!detection) return null;

  const milestone = milestoneFromDetection(detection);
  memoryCustomMilestones.push(milestone);
  await persistMilestone(milestone);

  try {
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

export function resetChronicleMemoryState(): void {
  memoryPending = [];
  memoryCustomMilestones = [];
  lastRefreshedAt = new Date().toISOString();
  lastBackgroundRefreshAttempt = 0;
  lastAutoPromotedAt = undefined;
  memoryAutoPromoteTimestamps.length = 0;
}

async function maybeBackgroundRefresh(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastBackgroundRefreshAttempt < CHRONICLE_BACKGROUND_REFRESH_MS) return;
  lastBackgroundRefreshAttempt = now;
  await refreshChronicleSources();
}

export async function getProjectChronicle(options?: { refresh?: boolean }): Promise<ProjectChronicleSnapshot> {
  if (options?.refresh) {
    await refreshChronicleSources();
  } else {
    await maybeBackgroundRefresh(false);
  }

  const dbMilestones = await loadDbMilestones();
  const milestones = mergeMilestones(SEED_MILESTONES, dbMilestones, memoryCustomMilestones);
  const leaderboard = [...milestones]
    .sort((a, b) => b.significance - a.significance || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 25);

  const pendingRaw = (await loadDbPending()) ?? memoryPending;
  const pendingDetections = pendingRaw
    .filter((d) => d.status === 'pending')
    .map(enrichPending)
    .slice(0, MAX_PENDING_QUEUE);

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
      subtitle: 'An autobiography written from evidence — only major, verified progress is recorded automatically.',
      chapters: SELF_NARRATIVE_CHAPTERS,
    },
    pendingDetections,
    chroniclePolicy: {
      majorOnly: true,
      autoRefreshHours: CHRONICLE_BACKGROUND_REFRESH_MS / (60 * 60 * 1000),
      maxPendingQueue: MAX_PENDING_QUEUE,
      maxAutoPromotesPerWeek: MAX_AUTO_PROMOTES_PER_WEEK,
      minAutoPromoteConfidence: MIN_AUTO_PROMOTE_CONFIDENCE,
    },
    lastRefreshedAt,
    lastAutoPromotedAt,
    generatedAt: new Date().toISOString(),
  };
}

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

// Re-export for tests
export { scoreMajorCommitMessage, verifyDetection } from './projectChronicleVerification';
