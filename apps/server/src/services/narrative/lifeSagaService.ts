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

export type LifeSagaStoryline = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  status: string;
  momentum: string;
  intensityScore: number;
  timeStart: string | null;
  timeEnd: string | null;
  participants: string[];
  eventIds: string[];
  sceneIds: string[];
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
};

function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function storylineDomain(row: NarrativeStoryChapterRow): string {
  const metaDomain = (row.metadata as { ownership?: { domain?: string } } | null)?.ownership?.domain;
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
  const [eras, lifeChapters, storylines, ir] = await Promise.all([
    narrativeLifeEraService.listEras(userId, { limit: 50 }),
    narrativeLifeChapterService.listChapters(userId, { limit: 200 }),
    narrativeStoryChapterService.listChapters(userId, { limit: 500 }),
    narrativeCompilerService.compile(userId).catch(() => null),
  ]);

  const lifecycleInputs = storylines.map(toLifecycleInput);
  const lifecycleById = new Map(
    storylines.map((row, i) => [row.id, computeStorylineLifecycle(lifecycleInputs[i], lifecycleInputs)]),
  );

  const storylinesByLifeChapter = new Map<string, LifeSagaStoryline[]>();
  for (const row of storylines) {
    const lifeChapterId = row.life_chapter_id;
    if (!lifeChapterId) continue;
    const lifecycle = lifecycleById.get(row.id)!;
    const storyline: LifeSagaStoryline = {
      id: row.id,
      title: row.title,
      summary: row.summary,
      domain: storylineDomain(row),
      status: lifecycle.status,
      momentum: lifecycle.momentum,
      intensityScore: lifecycle.intensityScore,
      timeStart: row.time_start,
      timeEnd: row.time_end,
      participants: row.participants ?? [],
      eventIds: row.event_ids ?? [],
      sceneIds: row.scene_ids ?? [],
    };
    const list = storylinesByLifeChapter.get(lifeChapterId);
    if (list) list.push(storyline);
    else storylinesByLifeChapter.set(lifeChapterId, [storyline]);
  }

  const chaptersByEra = new Map<string, LifeSagaChapter[]>();
  for (const chapterRow of lifeChapters) {
    const chapterStorylines = (storylinesByLifeChapter.get(chapterRow.id) ?? []).sort(
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
  };
}

export const lifeSagaService = { build: buildLifeSaga };
