import { fetchJson } from '../lib/api';

/** @deprecated kept only for the unused _future-surfaces/saga stub */
export type SagaChapter = { id: string; title: string; summary: string; turningPoint?: boolean };

export type SagaStoryline = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  status: string;
  momentum: string;
  intensity: number;
  eventIds: string[];
};

export type SagaChapterGroup = {
  id: string;
  title: string;
  domain: string;
  summary: string;
  storylines: SagaStoryline[];
};

export type SagaEra = {
  id: string;
  title: string;
  summary: string;
  isCurrent: boolean;
  chapters: SagaChapterGroup[];
};

export type SagaTurningPoint = {
  id: string;
  title: string;
  date: string | null;
  kind: string;
  importance: number;
};

export type SagaOverview = {
  era: string;
  currentStorylines: { id: string; label: string; intensity: number }[];
  eras: SagaEra[];
  turningPoints: SagaTurningPoint[];
};

type LifeSagaStorylineDto = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  status: string;
  momentum: string;
  intensityScore: number;
  eventIds: string[];
};

type LifeSagaChapterDto = {
  id: string;
  title: string;
  domain: string;
  summary: string;
  storylines: LifeSagaStorylineDto[];
};

type LifeSagaEraDto = {
  id: string;
  title: string;
  summary: string;
  isCurrent: boolean;
  chapters: LifeSagaChapterDto[];
};

type LifeSagaResponse = {
  success: boolean;
  saga: {
    eras: LifeSagaEraDto[];
    currentStorylines: LifeSagaStorylineDto[];
    turningPoints: Array<{
      id: string;
      title: string;
      date: string | null;
      kind: string;
      importance: number;
    }>;
  };
};

const EMPTY_SAGA: SagaOverview = { era: 'Current Era', currentStorylines: [], eras: [], turningPoints: [] };

function toStoryline(dto: LifeSagaStorylineDto): SagaStoryline {
  return {
    id: dto.id,
    title: dto.title,
    summary: dto.summary,
    domain: dto.domain,
    status: dto.status,
    momentum: dto.momentum,
    intensity: Math.round(dto.intensityScore),
    eventIds: dto.eventIds ?? [],
  };
}

export const fetchSaga = async (): Promise<{ saga: SagaOverview }> => {
  try {
    const response = await fetchJson<LifeSagaResponse>('/api/story/life-saga');
    const eras: SagaEra[] = (response.saga.eras ?? []).map((eraDto) => ({
      id: eraDto.id,
      title: eraDto.title,
      summary: eraDto.summary,
      isCurrent: eraDto.isCurrent,
      chapters: (eraDto.chapters ?? []).map((chapterDto) => ({
        id: chapterDto.id,
        title: chapterDto.title,
        domain: chapterDto.domain,
        summary: chapterDto.summary,
        storylines: (chapterDto.storylines ?? []).map(toStoryline),
      })),
    }));

    const currentEra = eras.find((e) => e.isCurrent) ?? eras[eras.length - 1];
    const era = currentEra?.title ?? 'Current Era';

    const currentStorylines = (response.saga.currentStorylines ?? [])
      .slice(0, 8)
      .map((s) => ({ id: s.id, label: s.title, intensity: Math.round(s.intensityScore) }));

    const turningPoints: SagaTurningPoint[] = (response.saga.turningPoints ?? []).map((tp) => ({
      id: tp.id,
      title: tp.title,
      date: tp.date,
      kind: tp.kind,
      importance: tp.importance,
    }));

    return { saga: { era, currentStorylines, eras, turningPoints } };
  } catch {
    return { saga: EMPTY_SAGA };
  }
};
