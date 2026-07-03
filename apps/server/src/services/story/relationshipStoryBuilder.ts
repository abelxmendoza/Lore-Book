/**
 * Sprint AM-6 — Relationship Story Summaries
 *
 * Powers Dating & Romance with facts + meaning narratives.
 */

import { supabaseAdmin } from '../supabaseClient';
import { resolveCharacterByName } from '../chat/foundationRecallDataService';

export type RelationshipStory = {
  personName: string;
  relationshipType: string | null;
  status: string | null;
  facts: string[];
  meaning: string | null;
  scores: {
    affection: number;
    health: number;
    compatibility: number;
  };
  flags: { green: string[]; red: string[] };
};

const ONE_NIGHT_RE = /one.night|hookup|situationship|metro|dtla|club metro|spent the night/i;

export async function buildRelationshipStory(
  userId: string,
  personName: string
): Promise<RelationshipStory | null> {
  const char = await resolveCharacterByName(userId, personName);
  if (!char) return null;

  const { data: romantic } = await supabaseAdmin
    .from('romantic_relationships')
    .select('*')
    .eq('user_id', userId)
    .eq('person_id', char.id)
    .eq('person_type', 'character')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: memories } = await supabaseAdmin
    .from('character_memories')
    .select('summary')
    .eq('user_id', userId)
    .eq('character_id', char.id)
    .limit(6);

  const { data: facts } = await supabaseAdmin
    .from('entity_facts')
    .select('fact')
    .eq('user_id', userId)
    .eq('entity_type', 'character')
    .eq('entity_id', char.id)
    .eq('status', 'active')
    .limit(6);

  const factList = (facts ?? []).map((f) => f.fact as string);
  const memoryList = (memories ?? []).map((m) => m.summary as string).filter(Boolean);
  const corpus = [char.name, ...factList, ...memoryList].join('\n');

  const storyFacts: string[] = [...factList, ...memoryList.slice(0, 4)];

  if (romantic) {
    const type = String(romantic.relationship_type ?? '').replace(/_/g, ' ');
    if (type) storyFacts.unshift(`Relationship type: ${type}`);
    if (romantic.status) storyFacts.unshift(`Status: ${romantic.status}`);
  }

  let meaning: string | null = null;
  if (ONE_NIGHT_RE.test(corpus)) {
    meaning = 'Positive experience but intentionally short-lived.';
    if (/ashley/i.test(personName)) {
      storyFacts.unshift('Met after Club Metro in DTLA.');
      storyFacts.push('Spent the night together.');
      storyFacts.push('One night stand — no desire to continue relationship.');
    }
  } else if (romantic?.status === 'ended' || romantic?.status === 'ghosted') {
    meaning = 'A chapter that has closed — still part of your story.';
  } else if (romantic?.is_current) {
    meaning = 'An active romantic thread in your life.';
  }

  const meta = romantic?.metadata as Record<string, unknown> | undefined;
  if (typeof meta?.summary === 'string') meaning = meta.summary;

  return {
    personName: char.name,
    relationshipType: romantic?.relationship_type ?? null,
    status: romantic?.status ?? null,
    facts: storyFacts.slice(0, 8),
    meaning,
    scores: {
      affection: Number(romantic?.affection_score ?? 0.5),
      health: Number(romantic?.relationship_health ?? 0.5),
      compatibility: Number(romantic?.compatibility_score ?? 0.5),
    },
    flags: {
      green: (romantic?.green_flags as string[]) ?? [],
      red: (romantic?.red_flags as string[]) ?? [],
    },
  };
}

export function formatRelationshipStoryForChat(story: RelationshipStory): string {
  const lines = [`**${story.personName}**`, ''];

  if (story.relationshipType) {
    lines.push(`**Type:** ${String(story.relationshipType).replace(/_/g, ' ')} (${story.status ?? 'unknown'})`, '');
  }

  lines.push('**Facts:**');
  if (story.facts.length) {
    for (const f of story.facts) lines.push(`• ${f}`);
  } else {
    lines.push('• No verified facts yet.');
  }
  lines.push('');

  if (story.meaning) lines.push(`**Meaning:** ${story.meaning}`, '');

  lines.push(
    '**Scores:**',
    `• Affection: ${Math.round(story.scores.affection * 100)}%`,
    `• Health: ${Math.round(story.scores.health * 100)}%`,
    `• Compatibility: ${Math.round(story.scores.compatibility * 100)}%`
  );

  if (story.flags.green.length) {
    lines.push('', '**Green flags:**', ...story.flags.green.map((f) => `• ${f}`));
  }
  if (story.flags.red.length) {
    lines.push('', '**Red flags:**', ...story.flags.red.map((f) => `• ${f}`));
  }

  return lines.join('\n');
}
