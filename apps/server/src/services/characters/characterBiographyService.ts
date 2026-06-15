/**
 * Sprint AL-5 — Character Biography Builder (deterministic, cached)
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

export type CharacterBiography = {
  roleInStory: string;
  firstSeen: string | null;
  lastSeen: string | null;
  majorMoments: string[];
  relationshipSummary: string | null;
  narrativeSummary: string;
};

const FAMILY_REL =
  /family|grand|abuela|abuelo|mother|father|brother|sister|aunt|uncle|t[ií]o|t[ií]a|cousin|parent|child|spouse/i;

const ROMANTIC_REL = /romantic|partner|crush|dating|boyfriend|girlfriend|one.night|hookup|lover|situationship/i;

const WORK_REL = /colleague|boss|manager|work|professional|onboarding|employer|mentor/i;

function inferRoleInStory(name: string, relationshipTypes: string[], summary: string | null): string {
  const text = [name, ...relationshipTypes, summary ?? ''].join(' ').toLowerCase();

  if (FAMILY_REL.test(text) || /^(abuela|abuelo|t[ií]o|t[ií]a|grandma|grandpa)\b/i.test(name)) {
    return 'Family anchor.';
  }
  if (ROMANTIC_REL.test(text)) {
    if (/one.night|hookup|situationship|metro/i.test(text)) {
      return 'Romantic connection from a past chapter.';
    }
    return 'Significant romantic figure.';
  }
  if (WORK_REL.test(text) || /kelly|onboarding|amazon/i.test(text)) {
    return 'Professional contact during a work chapter.';
  }
  if (/scene|party|concert|club|hell fairy|goth/i.test(text)) {
    return 'Scene character — part of the social world.';
  }
  return 'Supporting figure in the story.';
}

function buildNarrativeSummary(
  name: string,
  role: string,
  majorMoments: string[],
  memoryCount: number
): string {
  const momentNote =
    majorMoments.length > 0
      ? ` Key moments include ${majorMoments.slice(0, 2).join('; ')}.`
      : memoryCount > 0
        ? ` Appears in ${memoryCount} linked ${memoryCount === 1 ? 'memory' : 'memories'}.`
        : '';
  return `${name}: ${role}${momentNote}`;
}

export async function buildCharacterBiography(
  userId: string,
  characterId: string
): Promise<CharacterBiography | null> {
  const { data: character } = await supabaseAdmin
    .from('characters')
    .select('name, summary, created_at, first_appearance, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  if (!character) return null;

  const [{ data: rels }, { data: memories }, { data: timeline }] = await Promise.all([
    supabaseAdmin
      .from('character_relationships')
      .select('relationship_type, summary')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`),
    supabaseAdmin
      .from('character_memories')
      .select('summary, created_at')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('character_timeline_events')
      .select('event_title, event_date')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .order('event_date', { ascending: true }),
  ]);

  const relTypes = (rels ?? []).map((r) => r.relationship_type as string);
  const roleInStory = inferRoleInStory(character.name, relTypes, character.summary);

  const firstSeen =
    timeline?.[0]?.event_date ??
    memories?.[0]?.created_at ??
    character.first_appearance ??
    character.created_at ??
    null;

  const lastSeen =
    timeline?.[timeline.length - 1]?.event_date ??
    memories?.[memories.length - 1]?.created_at ??
    null;

  const majorMoments = [
    ...(timeline ?? []).slice(-5).map((t) => t.event_title as string),
    ...(memories ?? [])
      .filter((m) => m.summary)
      .slice(-3)
      .map((m) => String(m.summary).slice(0, 80)),
  ].slice(0, 5);

  const relationshipSummary =
    rels && rels.length > 0
      ? rels
          .map((r) => `${String(r.relationship_type).replace(/_/g, ' ')}${r.summary ? `: ${r.summary}` : ''}`)
          .slice(0, 3)
          .join('; ')
      : null;

  const narrativeSummary = buildNarrativeSummary(
    character.name,
    roleInStory,
    majorMoments,
    memories?.length ?? 0
  );

  return {
    roleInStory,
    firstSeen: firstSeen ? new Date(firstSeen).toISOString() : null,
    lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
    majorMoments,
    relationshipSummary,
    narrativeSummary,
  };
}

export async function persistCharacterBiography(
  userId: string,
  characterId: string,
  biography: CharacterBiography
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('characters')
    .select('metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  const metadata = (existing?.metadata ?? {}) as Record<string, unknown>;

  await supabaseAdmin
    .from('characters')
    .update({
      updated_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        al_biography: {
          role_in_story: biography.roleInStory,
          first_seen: biography.firstSeen,
          last_seen: biography.lastSeen,
          major_moments: biography.majorMoments,
          relationship_summary: biography.relationshipSummary,
          narrative_summary: biography.narrativeSummary,
          computed_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', characterId)
    .eq('user_id', userId);
}

export async function buildAndPersistBiography(
  userId: string,
  characterId: string
): Promise<CharacterBiography | null> {
  const bio = await buildCharacterBiography(userId, characterId);
  if (!bio) return null;
  await persistCharacterBiography(userId, characterId, bio);
  return bio;
}

export async function buildAllBiographiesForUser(userId: string): Promise<{ built: number }> {
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId);

  let built = 0;
  for (const c of chars ?? []) {
    try {
      const bio = await buildAndPersistBiography(userId, c.id);
      if (bio) built++;
    } catch (err) {
      logger.warn({ err, characterId: c.id }, 'AL biography build failed');
    }
  }
  return { built };
}

export async function getCharacterBiographyCoverage(userId: string): Promise<{
  total: number;
  with_biography: number;
  coverage_pct: number;
}> {
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('metadata')
    .eq('user_id', userId);

  const total = chars?.length ?? 0;
  const withBio = (chars ?? []).filter((c) => {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    return Boolean((meta.al_biography as Record<string, unknown> | undefined)?.narrative_summary);
  }).length;

  return {
    total,
    with_biography: withBio,
    coverage_pct: total > 0 ? Math.round((withBio / total) * 1000) / 10 : 0,
  };
}
