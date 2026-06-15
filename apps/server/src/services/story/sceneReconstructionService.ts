/**
 * Sprint AM-1 — Scene Reconstruction Engine
 *
 * Reconstructs a coherent scene from person, place, event, or thread context.
 * Deterministic — no LLM.
 */

import { supabaseAdmin } from '../supabaseClient';
import { resolveCharacterByName } from '../chat/foundationRecallDataService';
import { extractSignificanceFromText } from '../chat/significanceRecall';

export type SceneReconstruction = {
  summary: string;
  participants: string[];
  location: string | null;
  activities: string[];
  emotional_context: string | null;
  significance: string | null;
  evidence: {
    memories: number;
    events: number;
    thread_messages: number;
    facts: number;
  };
};

const ACTIVITY_RE =
  /\b(building|smoking|playing|discussing|coding|eating|visiting|shopping|working|driving|talking about|doubting|developing)\b[^.!?]{0,60}/gi;

function extractActivities(text: string): string[] {
  const acts: string[] = [];
  for (const m of text.matchAll(ACTIVITY_RE)) {
    acts.push(m[0].trim());
  }
  return [...new Set(acts)].slice(0, 8);
}

function extractParticipants(text: string, seed: string[]): string[] {
  const names = new Set(seed);
  const matches =
    text.match(/\b[A-ZÁÉÍÓÚÑ][a-z]+(?:\s+(?:de|del|T[ií]o|T[ií]a)\s+)?[A-ZÁÉÍÓÚÑ][a-z]+(?:\s+[A-ZÁÉÍÓÚÑ][a-z]+)*/g) ?? [];
  for (const n of matches) names.add(n);
  return [...names].slice(0, 12);
}

async function loadTextCorpus(
  userId: string,
  query: string,
  options: { threadId?: string; characterId?: string }
): Promise<string[]> {
  const texts: string[] = [];
  const like = `%${query}%`;

  const [{ data: memories }, { data: entries }, { data: chatRows }] = await Promise.all([
    options.characterId
      ? supabaseAdmin
          .from('character_memories')
          .select('summary, journal_entry_id')
          .eq('user_id', userId)
          .eq('character_id', options.characterId)
          .limit(10)
      : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from('journal_entries')
      .select('content')
      .eq('user_id', userId)
      .ilike('content', like)
      .order('date', { ascending: false })
      .limit(8),
    options.threadId
      ? supabaseAdmin
          .from('chat_messages')
          .select('content')
          .eq('user_id', userId)
          .eq('session_id', options.threadId)
          .eq('role', 'user')
          .limit(20)
      : supabaseAdmin
          .from('chat_messages')
          .select('content')
          .eq('user_id', userId)
          .eq('role', 'user')
          .ilike('content', like)
          .order('created_at', { ascending: false })
          .limit(10),
  ]);

  for (const m of memories ?? []) {
    if (m.summary) texts.push(String(m.summary));
  }

  if (memories?.length) {
    const ids = memories.map((m) => m.journal_entry_id).filter(Boolean);
    if (ids.length) {
      const { data: linked } = await supabaseAdmin
        .from('journal_entries')
        .select('content')
        .in('id', ids)
        .limit(8);
      for (const e of linked ?? []) texts.push(String(e.content).slice(0, 500));
    }
  }

  for (const e of entries ?? []) texts.push(String(e.content).slice(0, 500));
  for (const c of chatRows ?? []) {
    if (String(c.content).toLowerCase().includes(query.toLowerCase())) {
      texts.push(String(c.content).slice(0, 400));
    }
  }

  return texts;
}

export async function reconstructSceneByPerson(
  userId: string,
  personName: string,
  options: { threadId?: string } = {}
): Promise<SceneReconstruction | null> {
  const char = await resolveCharacterByName(userId, personName);
  const query = char?.name ?? personName;

  const texts = await loadTextCorpus(userId, query, {
    threadId: options.threadId,
    characterId: char?.id,
  });

  if (texts.length === 0 && !char) return null;

  const combined = texts.join('\n');
  const participants = extractParticipants(combined, [query]);
  const activities = extractActivities(combined);
  const significance = extractSignificanceFromText(combined)[0] ?? null;

  const locationMatch = combined.match(
    /\b(?:at|in)\s+(?:the\s+)?([A-Z][\w\s.'-]{2,40}(?:'s\s+(?:house|home|place))?)/i
  );
  const location = locationMatch?.[1]?.trim() ?? null;

  const emotionalMatch = combined.match(
    /\b(felt|feeling|happy|grateful|loved|anxious|excited|meaningful|special|highlight)\b[^.!?]{0,80}/i
  );

  let summary = `Scenes involving **${query}**`;
  if (location) summary = `Visit/scene at **${location}** involving **${query}**.`;
  else if (activities.length) summary = `Time with **${query}** — ${activities[0]}.`;

  const [{ count: memCount }, { count: eventCount }] = await Promise.all([
    char
      ? supabaseAdmin
          .from('character_memories')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('character_id', char.id)
      : Promise.resolve({ count: 0 }),
    char
      ? supabaseAdmin
          .from('character_timeline_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('character_id', char.id)
      : Promise.resolve({ count: 0 }),
  ]);

  const { count: factCount } = char
    ? await supabaseAdmin
        .from('entity_facts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('entity_type', 'character')
        .eq('entity_id', char.id)
        .eq('status', 'active')
    : { count: 0 };

  return {
    summary,
    participants,
    location,
    activities,
    emotional_context: emotionalMatch?.[0]?.trim() ?? null,
    significance,
    evidence: {
      memories: memCount ?? 0,
      events: eventCount ?? 0,
      thread_messages: texts.length,
      facts: factCount ?? 0,
    },
  };
}

export async function reconstructSceneByPlace(
  userId: string,
  placeName: string,
  options: { threadId?: string } = {}
): Promise<SceneReconstruction | null> {
  const texts = await loadTextCorpus(userId, placeName, { threadId: options.threadId });
  if (texts.length === 0) return null;

  const combined = texts.join('\n');
  return {
    summary: `What happened at **${placeName}**.`,
    participants: extractParticipants(combined, []),
    location: placeName,
    activities: extractActivities(combined),
    emotional_context: extractSignificanceFromText(combined)[0] ?? null,
    significance: extractSignificanceFromText(combined)[0] ?? null,
    evidence: {
      memories: 0,
      events: 0,
      thread_messages: texts.length,
      facts: 0,
    },
  };
}

export async function reconstructSceneFromThread(
  userId: string,
  threadId: string
): Promise<SceneReconstruction | null> {
  const texts = await loadTextCorpus(userId, '', { threadId });
  if (texts.length === 0) return null;

  const combined = texts.join('\n');
  return {
    summary: 'Scene reconstructed from current thread.',
    participants: extractParticipants(combined, []),
    location: combined.match(/\b(?:at|in)\s+(?:the\s+)?([A-Z][\w\s.'-]{2,40})/i)?.[1] ?? null,
    activities: extractActivities(combined),
    emotional_context: null,
    significance: extractSignificanceFromText(combined)[0] ?? null,
    evidence: { memories: 0, events: 0, thread_messages: texts.length, facts: 0 },
  };
}

export function formatSceneForChat(scene: SceneReconstruction): string {
  const lines = [`**${scene.summary}**`, ''];

  if (scene.participants.length) {
    lines.push('**Participants:**', ...scene.participants.map((p) => `• ${p}`), '');
  }
  if (scene.location) lines.push(`**Location:** ${scene.location}`, '');
  if (scene.activities.length) {
    lines.push('**Activities:**', ...scene.activities.map((a) => `• ${a}`), '');
  }
  if (scene.emotional_context) lines.push(`**Emotional context:** ${scene.emotional_context}`, '');
  if (scene.significance) lines.push(`**Meaning:** ${scene.significance}`, '');

  lines.push(
    '**Evidence:**',
    `• ${scene.evidence.memories} linked memories`,
    `• ${scene.evidence.events} timeline events`,
    `• ${scene.evidence.thread_messages} source text(s)`,
    `• ${scene.evidence.facts} verified facts`
  );

  return lines.join('\n');
}
