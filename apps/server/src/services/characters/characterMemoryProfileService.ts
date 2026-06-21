/**
 * Sprint AM-2 — Character Memory Profiles
 *
 * Rich biographer-style profiles from stored lore — not generic relationship labels.
 */

import { supabaseAdmin } from '../supabaseClient';
import { resolveCharacterByName } from '../chat/foundationRecallDataService';
import { buildCharacterBiography } from '../characters/characterBiographyService';
import { calculateCharacterImportance } from '../characters/characterImportanceService';

export type CharacterMemoryProfile = {
  whoAreThey: string;
  relationshipToUser: string | null;
  majorMemories: string[];
  recurringPatterns: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  importanceScore: number;
  biography: string;
};

const PATTERN_RULES: Array<{ re: RegExp; label: string }> = [
  { re: /\b(makes sure i eat|feeds me|checks on me|looks after)\b/i, label: 'Caretaker — makes sure you eat' },
  { re: /\b(lives with|live together|same house|household)\b/i, label: 'Lives with user' },
  { re: /\b(medical|doctor|appointment|hospital|health)\b/i, label: 'Medical / health appointments' },
  { re: /\b(costco|groceries|shopping|errands)\b/i, label: 'Shared errands and outings' },
  { re: /\b(building|coding|lorebook|lore book|project)\b/i, label: 'Participates in LoreBook development' },
  { re: /\b(onboarding|amazon|work|job|hiring)\b/i, label: 'Professional / work chapter' },
  { re: /\b(club metro|dtla|party|scene|goth)\b/i, label: 'Scene / nightlife context' },
];

function detectPatterns(text: string): string[] {
  const patterns: string[] = [];
  for (const rule of PATTERN_RULES) {
    if (rule.re.test(text)) patterns.push(rule.label);
  }
  return [...new Set(patterns)];
}

function buildWhoAreThey(
  name: string,
  relTypes: string[],
  facts: string[],
  patterns: string[],
  meta: Record<string, unknown>
): string {
  const bullets: string[] = [];

  if (/^(t[ií]o|t[ií]a|abuela|abuelo|uncle|aunt|grand)/i.test(name)) {
    bullets.push(`${name} — family figure in your household story.`);
  }

  for (const p of patterns.slice(0, 4)) bullets.push(p);
  for (const f of facts.slice(0, 4)) {
    if (!bullets.some((b) => b.toLowerCase().includes(f.toLowerCase().slice(0, 20)))) {
      bullets.push(f);
    }
  }

  if (relTypes.length) {
    bullets.push(`Relationship type: ${relTypes.map((t) => t.replace(/_/g, ' ')).join(', ')}`);
  }

  const bio = meta.al_biography as Record<string, unknown> | undefined;
  if (typeof bio?.role_in_story === 'string') bullets.unshift(String(bio.role_in_story));

  return bullets.length ? bullets.join('\n• ') : `${name} appears in your story.`;
}

export async function buildCharacterMemoryProfile(
  userId: string,
  personName: string
): Promise<CharacterMemoryProfile | null> {
  const char = await resolveCharacterByName(userId, personName);
  if (!char) return null;

  const { data: charRow } = await supabaseAdmin
    .from('characters')
    .select('summary, metadata')
    .eq('id', char.id)
    .single();

  const [bio, importance, { data: rels }, { data: memories }, { data: facts }] =
    await Promise.all([
      buildCharacterBiography(userId, char.id),
      calculateCharacterImportance(userId, char.id),
      supabaseAdmin
        .from('character_relationships')
        .select('relationship_type, summary')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`),
      supabaseAdmin
        .from('character_memories')
        .select('summary, created_at')
        .eq('user_id', userId)
        .eq('character_id', char.id)
        .order('created_at', { ascending: false })
        .limit(8),
      supabaseAdmin
        .from('entity_facts')
        .select('fact')
        .eq('user_id', userId)
        .eq('entity_type', 'character')
        .eq('entity_id', char.id)
        .eq('status', 'active')
        .limit(8),
    ]);

  const relTypes = (rels ?? []).map((r) => r.relationship_type as string);
  const factStrings = (facts ?? []).map((f) => f.fact as string);
  const memorySummaries = (memories ?? [])
    .map((m) => m.summary as string)
    .filter(Boolean);

  const corpus = [char.name, ...factStrings, ...memorySummaries, charRow?.summary ?? ''].join('\n');
  const patterns = detectPatterns(corpus);

  const meta = (charRow?.metadata ?? char.metadata ?? {}) as Record<string, unknown>;

  const relationshipToUser =
    rels?.[0]
      ? `${String(rels[0].relationship_type).replace(/_/g, ' ')}${rels[0].summary ? ` — ${rels[0].summary}` : ''}`
      : null;

  return {
    whoAreThey: buildWhoAreThey(char.name, relTypes, factStrings, patterns, meta),
    relationshipToUser,
    majorMemories: memorySummaries.slice(0, 6),
    recurringPatterns: patterns,
    firstSeen: bio?.firstSeen ?? null,
    lastSeen: bio?.lastSeen ?? null,
    importanceScore: importance.importanceScore,
    biography: bio?.narrativeSummary ?? `${char.name} in your story.`,
  };
}

export function formatCharacterMemoryProfileForChat(profile: CharacterMemoryProfile, name: string): string {
  const lines = [`**${name}**`, ''];

  lines.push('**Who they are:**', `• ${profile.whoAreThey}`, '');

  if (profile.relationshipToUser) {
    lines.push(`**Relationship to you:** ${profile.relationshipToUser}`, '');
  }

  if (profile.recurringPatterns.length) {
    lines.push('**Recurring themes:**', ...profile.recurringPatterns.map((p) => `• ${p}`), '');
  }

  if (profile.majorMemories.length) {
    lines.push('**Major memories:**', ...profile.majorMemories.map((m) => `• ${m}`), '');
  }

  lines.push(
    `**Importance:** ${profile.importanceScore}/100`,
    profile.firstSeen ? `**First seen:** ${new Date(profile.firstSeen).toLocaleDateString()}` : '',
    profile.lastSeen ? `**Last seen:** ${new Date(profile.lastSeen).toLocaleDateString()}` : '',
    '',
    '**Biography:**',
    profile.biography
  );

  return lines.filter(Boolean).join('\n');
}
