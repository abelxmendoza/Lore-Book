/**
 * Life Saga — the full autobiographical tree for the Saga screen.
 *
 * Assembles: Life Eras → Life Chapters (domain groupings) → Storylines
 * (with computed lifecycle/intensity), plus a flattened "current storylines"
 * list and real turning points. Read-only aggregation over already-persisted
 * rows — no new extraction.
 */

import { narrativeLifeEraService, type NarrativeLifeEraRow } from './narrativeLifeEraService';
import { narrativeLifeChapterService, type NarrativeLifeChapterRow } from './narrativeLifeChapterService';
import {
  narrativeStoryChapterService,
  type NarrativeStoryChapterRow,
} from './narrativeStoryChapterService';
import { computeStorylineLifecycle, type StorylineLifecycleInput } from './storylineLifecycle';
import { narrativeCompilerService } from './narrativeCompilerService';
import type { NarrativeTurningPoint } from './types';
import { supabaseAdmin } from '../supabaseClient';

export type LifeSagaStoryline = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  status: string;
  momentum: string;
  intensityScore: number;
  confidence: number;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  participants: string[];
  eventIds: string[];
  sceneIds: string[];
  primarySubject?: string | null;
};

export type LifeSagaChapter = {
  id: string;
  title: string;
  domain: string;
  summary: string;
  timeStart: string | null;
  timeEnd: string | null;
  storylines: LifeSagaStoryline[];
};

export type LifeSagaEra = {
  id: string;
  title: string;
  summary: string;
  isCurrent: boolean;
  timeStart: string | null;
  timeEnd: string | null;
  chapters: LifeSagaChapter[];
};

export type LifeSagaOverview = {
  eras: LifeSagaEra[];
  currentStorylines: LifeSagaStoryline[];
  turningPoints: NarrativeTurningPoint[];
  projectionGeneration: string | null;
};

function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function overlap(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function textSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(normalize(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalize(right).split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / new Set([...leftTokens, ...rightTokens]).size;
}

function sameTimeWindow(
  leftStart: string | null,
  leftEnd: string | null,
  rightStart: string | null,
  rightEnd: string | null,
): boolean {
  const a = ms(leftStart);
  const b = ms(leftEnd ?? leftStart);
  const c = ms(rightStart);
  const d = ms(rightEnd ?? rightStart);
  return Boolean(a && b && c && d && Math.max(a, c) <= Math.min(b, d));
}

function betterStoryline(
  left: NarrativeStoryChapterRow,
  right: NarrativeStoryChapterRow,
): NarrativeStoryChapterRow {
  const leftScore = Number(left.significance_score ?? 0) + Number(left.confidence ?? 0) * 100;
  const rightScore = Number(right.significance_score ?? 0) + Number(right.confidence ?? 0) * 100;
  if (rightScore !== leftScore) return rightScore > leftScore ? right : left;
  return String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')) > 0 ? right : left;
}

function mergeStorylineRows(
  base: NarrativeStoryChapterRow,
  duplicate: NarrativeStoryChapterRow,
): NarrativeStoryChapterRow {
  const preferred = betterStoryline(base, duplicate);
  return {
    ...preferred,
    id: base.id,
    scene_ids: Array.from(new Set([...(base.scene_ids ?? []), ...(duplicate.scene_ids ?? [])])),
    event_ids: Array.from(new Set([...(base.event_ids ?? []), ...(duplicate.event_ids ?? [])])),
    participants: Array.from(new Set([...(base.participants ?? []), ...(duplicate.participants ?? [])])),
    life_chapter_id: preferred.life_chapter_id ?? base.life_chapter_id ?? duplicate.life_chapter_id ?? null,
  };
}

function sameStorylineIdentity(
  left: NarrativeStoryChapterRow,
  right: NarrativeStoryChapterRow,
): boolean {
  return (
    normalize(left.title) === normalize(right.title) &&
    normalize(storylineDomain(left)) === normalize(storylineDomain(right)) &&
    (
      !normalize(left.primary_subject) ||
      !normalize(right.primary_subject) ||
      normalize(left.primary_subject) === normalize(right.primary_subject)
    )
  );
}

function duplicateStorylineRows(
  left: NarrativeStoryChapterRow,
  right: NarrativeStoryChapterRow,
): boolean {
  if (!sameStorylineIdentity(left, right)) return false;
  return (
    overlap(left.scene_ids ?? [], right.scene_ids ?? []) ||
    overlap(left.event_ids ?? [], right.event_ids ?? []) ||
    sameTimeWindow(left.time_start, left.time_end, right.time_start, right.time_end) ||
    textSimilarity(left.summary, right.summary) >= 0.45
  );
}

function dedupeNarrativeStorylinesWithAliases(
  rows: NarrativeStoryChapterRow[],
): { rows: NarrativeStoryChapterRow[]; aliases: Map<string, string> } {
  const result: NarrativeStoryChapterRow[] = [];
  const aliases = new Map<string, string>();
  for (const row of rows) {
    const existingIndex = result.findIndex((candidate) => duplicateStorylineRows(candidate, row));
    if (existingIndex < 0) {
      result.push(row);
      aliases.set(row.id, row.id);
    } else {
      const survivor = result[existingIndex];
      result[existingIndex] = mergeStorylineRows(survivor, row);
      aliases.set(row.id, survivor.id);
    }
  }
  return { rows: result, aliases };
}

export function dedupeNarrativeStorylines(
  rows: NarrativeStoryChapterRow[],
): NarrativeStoryChapterRow[] {
  return dedupeNarrativeStorylinesWithAliases(rows).rows;
}

function dedupeLifeChaptersWithAliases(
  rows: NarrativeLifeChapterRow[],
  storylineAliases: Map<string, string>,
): { rows: NarrativeLifeChapterRow[]; aliases: Map<string, string> } {
  const result: NarrativeLifeChapterRow[] = [];
  const aliases = new Map<string, string>();
  for (const row of rows) {
    const existingIndex = result.findIndex((candidate) =>
      normalize(candidate.domain) === normalize(row.domain) &&
      normalize(candidate.title) === normalize(row.title) &&
      (
        overlap(candidate.storyline_ids ?? [], row.storyline_ids ?? []) ||
        overlap(candidate.scene_ids ?? [], row.scene_ids ?? []) ||
        sameTimeWindow(candidate.time_start, candidate.time_end, row.time_start, row.time_end) ||
        textSimilarity(candidate.summary, row.summary) >= 0.45
      ));
    if (existingIndex < 0) {
      result.push(row);
      aliases.set(row.id, row.id);
      continue;
    }
    const survivor = result[existingIndex];
    const preferred = survivor.confidence >= row.confidence ? survivor : row;
    result[existingIndex] = {
      ...preferred,
      id: survivor.id,
      storyline_ids: Array.from(new Set([
        ...(survivor.storyline_ids ?? []),
        ...(row.storyline_ids ?? []),
      ])),
      scene_ids: Array.from(new Set([
        ...(result[existingIndex].scene_ids ?? []),
        ...(row.scene_ids ?? []),
      ])),
      event_ids: Array.from(new Set([
        ...(result[existingIndex].event_ids ?? []),
        ...(row.event_ids ?? []),
      ])),
      era_id: preferred.era_id ?? result[existingIndex].era_id ?? row.era_id ?? null,
    };
    aliases.set(row.id, survivor.id);
  }
  return {
    rows: result.map((row) => ({
      ...row,
      storyline_ids: Array.from(new Set(
        (row.storyline_ids ?? []).map((id) => storylineAliases.get(id) ?? id),
      )),
    })),
    aliases,
  };
}

function dedupeLifeChapters(rows: NarrativeLifeChapterRow[]): NarrativeLifeChapterRow[] {
  return dedupeLifeChaptersWithAliases(rows, new Map()).rows;
}

function dedupeErasWithAliases(
  rows: NarrativeLifeEraRow[],
  lifeChapterAliases: Map<string, string>,
): { rows: NarrativeLifeEraRow[]; aliases: Map<string, string> } {
  const result: NarrativeLifeEraRow[] = [];
  const aliases = new Map<string, string>();
  for (const row of rows) {
    const existingIndex = result.findIndex((candidate) =>
      normalize(candidate.title) === normalize(row.title) &&
      (
        overlap(candidate.chapter_ids ?? [], row.chapter_ids ?? []) ||
        overlap(candidate.scene_ids ?? [], row.scene_ids ?? []) ||
        sameTimeWindow(candidate.time_start, candidate.time_end, row.time_start, row.time_end) ||
        textSimilarity(candidate.summary, row.summary) >= 0.45
      ));
    if (existingIndex < 0) {
      result.push(row);
      aliases.set(row.id, row.id);
      continue;
    }
    const survivor = result[existingIndex];
    const preferred = survivor.confidence >= row.confidence ? survivor : row;
    result[existingIndex] = {
      ...preferred,
      id: survivor.id,
      chapter_ids: Array.from(new Set([
        ...(survivor.chapter_ids ?? []),
        ...(row.chapter_ids ?? []),
      ])),
      scene_ids: Array.from(new Set([
        ...(result[existingIndex].scene_ids ?? []),
        ...(row.scene_ids ?? []),
      ])),
      event_ids: Array.from(new Set([
        ...(result[existingIndex].event_ids ?? []),
        ...(row.event_ids ?? []),
      ])),
    };
    aliases.set(row.id, survivor.id);
  }
  return {
    rows: result.map((row) => ({
      ...row,
      chapter_ids: Array.from(new Set(
        (row.chapter_ids ?? []).map((id) => lifeChapterAliases.get(id) ?? id),
      )),
    })),
    aliases,
  };
}

function dedupeEras(rows: NarrativeLifeEraRow[]): NarrativeLifeEraRow[] {
  return dedupeErasWithAliases(rows, new Map()).rows;
}

function storylineDomain(row: NarrativeStoryChapterRow): string {
  const metadata = row.metadata as { ownership?: { domain?: string }; domain?: string } | null;
  const metaDomain = metadata?.ownership?.domain ?? metadata?.domain;
  return metaDomain ?? row.themes?.[0] ?? 'unknown';
}

function toLifecycleInput(row: NarrativeStoryChapterRow): StorylineLifecycleInput {
  return {
    id: row.id,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    sceneCount: (row.scene_ids ?? []).length,
    significanceScore: row.significance_score,
    confidence: row.confidence,
    primaryOutcome: row.primary_outcome ?? null,
    domain: storylineDomain(row),
    primarySubject: row.primary_subject ?? null,
  };
}

export async function buildLifeSaga(userId: string): Promise<LifeSagaOverview> {
  const { data: publishedGeneration } = await supabaseAdmin
    .from('narrative_projection_generations')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const projectionGeneration = (publishedGeneration?.id as string | undefined) ?? null;
  const [rawEras, rawLifeChapters, rawStorylines, ir] = await Promise.all([
    narrativeLifeEraService.listEras(userId, { limit: 50, projectionGeneration }),
    narrativeLifeChapterService.listChapters(userId, { limit: 200, projectionGeneration }),
    narrativeStoryChapterService.listChapters(userId, { limit: 500, projectionGeneration }),
    narrativeCompilerService.compile(userId).catch(() => null),
  ]);
  const storylineProjection = dedupeNarrativeStorylinesWithAliases(rawStorylines);
  const storylines = storylineProjection.rows;
  const lifeChapterProjection = dedupeLifeChaptersWithAliases(
    rawLifeChapters,
    storylineProjection.aliases,
  );
  const lifeChapters = lifeChapterProjection.rows;
  const eraProjection = dedupeErasWithAliases(rawEras, lifeChapterProjection.aliases);
  const eras = eraProjection.rows;
  const generationCounts = new Map<string, number>();
  for (const row of [...rawStorylines, ...rawLifeChapters, ...rawEras]) {
    const generation = (row.metadata as Record<string, unknown> | null | undefined)?.projection_generation;
    if (typeof generation === 'string' && generation) {
      generationCounts.set(generation, (generationCounts.get(generation) ?? 0) + 1);
    }
  }
  const observedGeneration =
    projectionGeneration ??
    [...generationCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null;

  const lifecycleInputs = storylines.map(toLifecycleInput);
  const lifecycleSiblings = new Map<string, StorylineLifecycleInput[]>();
  for (const input of lifecycleInputs) {
    const key = `${normalize(input.domain)}|${normalize(input.primarySubject)}`;
    const siblings = lifecycleSiblings.get(key);
    if (siblings) siblings.push(input);
    else lifecycleSiblings.set(key, [input]);
  }
  const lifecycleById = new Map(
    storylines.map((row, i) => {
      const input = lifecycleInputs[i];
      const key = `${normalize(input.domain)}|${normalize(input.primarySubject)}`;
      return [row.id, computeStorylineLifecycle(input, lifecycleSiblings.get(key) ?? [])] as const;
    }),
  );

  const storylinesById = new Map<string, LifeSagaStoryline>();
  for (const row of storylines) {
    const lifecycle = lifecycleById.get(row.id)!;
    const storyline: LifeSagaStoryline = {
      id: row.id,
      title: row.title,
      summary: row.summary,
      domain: storylineDomain(row),
      status: lifecycle.status,
      momentum: lifecycle.momentum,
      intensityScore: lifecycle.intensityScore,
      confidence: row.confidence,
      timeStart: row.time_start,
      timeEnd: row.time_end,
      location: row.location ?? null,
      participants: row.participants ?? [],
      eventIds: row.event_ids ?? [],
      sceneIds: row.scene_ids ?? [],
      primarySubject: row.primary_subject ?? null,
    };
    storylinesById.set(row.id, storyline);
  }

  const chaptersByEra = new Map<string, LifeSagaChapter[]>();
  for (const chapterRow of lifeChapters) {
    const memberIds = chapterRow.storyline_ids ?? [];
    const chapterStorylines = memberIds
      .map((id) => storylinesById.get(id))
      .filter((storyline): storyline is LifeSagaStoryline => Boolean(storyline));
    if (chapterStorylines.length === 0) {
      chapterStorylines.push(
        ...storylines
          .filter((storyline) =>
            lifeChapterProjection.aliases.get(storyline.life_chapter_id ?? '') === chapterRow.id,
          ),
      );
    }
    chapterStorylines.sort(
      (a, b) => ms(a.timeStart) - ms(b.timeStart),
    );
    const chapter: LifeSagaChapter = {
      id: chapterRow.id,
      title: chapterRow.title,
      domain: chapterRow.domain,
      summary: chapterRow.summary,
      timeStart: chapterRow.time_start,
      timeEnd: chapterRow.time_end,
      storylines: chapterStorylines,
    };
    if (!chapterRow.era_id) continue;
    const list = chaptersByEra.get(chapterRow.era_id);
    if (list) list.push(chapter);
    else chaptersByEra.set(chapterRow.era_id, [chapter]);
  }

  const sagaEras: LifeSagaEra[] = eras.map((eraRow) => ({
    id: eraRow.id,
    title: eraRow.title,
    summary: eraRow.summary,
    isCurrent: Boolean(eraRow.is_current),
    timeStart: eraRow.time_start,
    timeEnd: eraRow.time_end,
    chapters: (chaptersByEra.get(eraRow.id) ?? []).sort((a, b) => ms(a.timeStart) - ms(b.timeStart)),
  }));

  const allStorylines = sagaEras.flatMap((era) => era.chapters.flatMap((c) => c.storylines));
  const currentStorylines = allStorylines
    .filter((s) => s.status === 'active' || s.status === 'emerging' || s.status === 'resurfaced')
    .sort((a, b) => b.intensityScore - a.intensityScore)
    .slice(0, 8);

  return {
    eras: sagaEras,
    currentStorylines,
    turningPoints: ir?.turningPoints ?? [],
    projectionGeneration: observedGeneration,
  };
}

export const lifeSagaService = { build: buildLifeSaga };
