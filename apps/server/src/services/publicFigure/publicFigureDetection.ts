/**
 * Heuristic public-figure detection — performers, influencers, scene personas.
 * Complements LLM flags from entityFactsService.
 */

export type FigureType = 'influencer' | 'celebrity' | 'artist' | 'creator' | 'performer' | 'other';
export type CloutLevel = 'local' | 'emerging' | 'rising' | 'established' | 'prominent' | 'global';

const PERFORMER_ROLE =
  /\b(dj|performer|artist|influencer|celebrity|creator|host|mc|drag|vocalist|rapper|model|streamer|youtuber|content creator|underground|scene icon|headliner)\b/i;

const SCENE_CONTEXT =
  /\b(goth|club|show|set|backstage|underground scene|afterparty|metro|venue|promoter|lineup)\b/i;

const STAGE_NAME_PATTERN = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/;

export function isLikelyStageName(name: string): boolean {
  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.length < 4) return false;
  if (!STAGE_NAME_PATTERN.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (/^(tia|tío|tio|uncle|aunt|mom|dad|abuela|cousin)\b/i.test(lower)) return false;
  return /\b(fairy|bat|goth|metro|velvet|shadow|night|dark|cyber|punk)\b/i.test(lower)
    || trimmed.split(/\s+/).length === 2;
}

export function detectPublicFigureProfile(input: {
  name: string;
  role?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}): { isPublicFigure: boolean; figureType: FigureType; cloutLevel: CloutLevel; reason: string } {
  const meta = input.metadata ?? {};
  if (meta.public_figure === true) {
    return {
      isPublicFigure: true,
      figureType: (meta.figure_type as FigureType) ?? 'artist',
      cloutLevel: (meta.clout_level as CloutLevel) ?? 'emerging',
      reason: 'metadata_flag',
    };
  }

  const blob = [input.name, input.role, input.summary, ...(input.tags ?? [])].filter(Boolean).join(' ');
  if (PERFORMER_ROLE.test(blob)) {
    const figureType: FigureType = /\b(dj|performer|vocalist|drag|rapper)\b/i.test(blob)
      ? 'performer'
      : /\b(influencer|creator|streamer|youtuber)\b/i.test(blob)
        ? 'influencer'
        : 'artist';
    const cloutLevel: CloutLevel = /\b(blowing up|everyone knows|verified|headliner|mainstream)\b/i.test(blob)
      ? 'rising'
      : /\b(underground|local|small shows|starting out)\b/i.test(blob)
        ? 'local'
        : 'emerging';
    return { isPublicFigure: true, figureType, cloutLevel, reason: 'role_keyword' };
  }

  if (isLikelyStageName(input.name) && SCENE_CONTEXT.test(blob)) {
    return {
      isPublicFigure: true,
      figureType: 'performer',
      cloutLevel: 'emerging',
      reason: 'stage_name_scene',
    };
  }

  return { isPublicFigure: false, figureType: 'other', cloutLevel: 'local', reason: 'not_public' };
}
