/**
 * Conversation Summary Builder — Sprint AG
 *
 * When the user asks "what else did I say in this conversation?", surface
 * structured lore (characters, facts, relationships, places) from the current
 * thread — not raw journal vector matches.
 */

import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import {
  fetchCharacterRoster,
  resolveCharacterByName,
  formatEntityProfileForChat,
  fetchEntityProfile,
} from './foundationRecallDataService';

type HistoryMessage = { role: string; content: string };

const PLACE_HINT =
  /\b(?:at|in|from|near)\s+(?:the\s+)?([A-Z][\w\s.'-]{2,40})(?:\s+(?:in|after|before|on)\b|[,.?!]|$)/g;

function extractCapitalizedPhrases(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+(?:de|del|la|los|las|y|van|von|di|da|le|el|the|a|an)\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  return matches ?? [];
}

async function findMentionedCharacterNames(
  userId: string,
  conversationText: string
): Promise<string[]> {
  const lower = conversationText.toLowerCase();
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('name, alias')
    .eq('user_id', userId);

  const found: string[] = [];
  const seen = new Set<string>();

  for (const c of chars ?? []) {
    const names = [c.name, ...((c.alias as string[] | null) ?? [])];
    for (const name of names) {
      const key = normalizeNameKey(name);
      if (key.length < 3 || seen.has(key)) continue;
      if (lower.includes(key)) {
        seen.add(key);
        found.push(c.name as string);
      }
    }
  }

  // Also try capitalized phrases from user text
  for (const phrase of extractCapitalizedPhrases(conversationText)) {
    if (phrase.length < 3) continue;
    const resolved = await resolveCharacterByName(userId, phrase);
    if (resolved) {
      const key = normalizeNameKey(resolved.name);
      if (!seen.has(key)) {
        seen.add(key);
        found.push(resolved.name);
      }
    }
  }

  // Dedupe by normalized name (capitalized-phrase pass can re-add same person)
  const unique: string[] = [];
  const finalSeen = new Set<string>();
  for (const name of found) {
    const key = normalizeNameKey(name);
    if (finalSeen.has(key)) continue;
    finalSeen.add(key);
    unique.push(name);
  }

  return unique.sort((a, b) => b.length - a.length);
}

function extractPlaceHints(text: string): string[] {
  const places = new Set<string>();
  for (const match of text.matchAll(PLACE_HINT)) {
    const place = match[1]?.trim();
    if (place && place.length > 2 && !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|I|We|They|She|He)$/i.test(place)) {
      places.add(place);
    }
  }
  // Known venue patterns
  const venuePatterns = [
    /\bclub\s+[A-Z][a-z]+/gi,
    /\bDTLA\b/g,
    /\b(?:downtown|dtla)\s+los angeles\b/gi,
  ];
  for (const pat of venuePatterns) {
    for (const m of text.matchAll(pat)) {
      places.add(m[0]);
    }
  }
  return [...places];
}

async function loadRomanticSnippet(userId: string, characterId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('romantic_relationships')
    .select('relationship_type, status, start_date, end_date, is_current, metadata')
    .eq('user_id', userId)
    .eq('person_id', characterId)
    .eq('person_type', 'character')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const status = data.status ? ` (${data.status})` : '';
  const type = (data.relationship_type as string).replace(/_/g, ' ');
  return `${type}${status}`;
}

export async function buildConversationSummary(
  userId: string,
  conversationHistory: HistoryMessage[]
): Promise<string> {
  if (conversationHistory.length === 0) {
    return 'No messages in this conversation yet.';
  }

  const userText = conversationHistory
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  const assistantText = conversationHistory
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .join('\n');

  const combined = `${userText}\n${assistantText}`;
  const lines: string[] = ['Here is what this conversation covers:', ''];

  const mentioned = await findMentionedCharacterNames(userId, combined);
  if (mentioned.length > 0) {
    lines.push(`**Characters mentioned (${mentioned.length})**`);
    for (const name of mentioned.slice(0, 8)) {
      const profile = await fetchEntityProfile(userId, name);
      if (profile) {
        const romantic = await loadRomanticSnippet(userId, profile.characterId);
        const rel = profile.relationshipToUser ?? romantic ?? null;
        lines.push(`• **${profile.name}**${rel ? ` — ${rel}` : ''}`);
        const { data: facts } = await supabaseAdmin
          .from('entity_facts')
          .select('fact, confidence')
          .eq('user_id', userId)
          .eq('entity_type', 'character')
          .eq('entity_id', profile.characterId)
          .eq('status', 'active')
          .order('confidence', { ascending: false })
          .limit(4);
        for (const f of facts ?? []) {
          lines.push(`  - ${f.fact as string}`);
        }
        if (profile.timelineEvents.length) {
          lines.push(`  - ${profile.timelineEvents.length} timeline event(s) on record`);
        }
      } else {
        lines.push(`• ${name}`);
      }
    }
    lines.push('');
  }

  const places = extractPlaceHints(combined);
  if (places.length) {
    lines.push(`**Places mentioned**`);
    for (const p of places.slice(0, 6)) lines.push(`• ${p}`);
    lines.push('');
  }

  const themes: string[] = [];
  if (/\b(family|abuela|t[ií]o|t[ií]a|cousin|brother|sister)\b/i.test(combined)) themes.push('family');
  if (/\b(date|dating|hookup|one night|spent the night|situationship|crush|love)\b/i.test(combined)) {
    themes.push('relationships');
  }
  if (/\b(club|party|show|event|concert|festival)\b/i.test(combined)) themes.push('events');
  if (themes.length) {
    lines.push(`**Themes:** ${themes.join(', ')}`);
    lines.push('');
  }

  const userTurns = conversationHistory.filter((m) => m.role === 'user').length;
  lines.push(`_${userTurns} message${userTurns === 1 ? '' : 's'} from you in this thread._`);

  if (mentioned.length === 0 && places.length === 0) {
    const recent = conversationHistory
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => `• You: ${m.content.slice(0, 160)}${m.content.length > 160 ? '…' : ''}`);
    if (recent.length) {
      lines.push('', '**Recent topics from you:**', ...recent);
    }
  }

  return lines.join('\n');
}

export async function buildConversationSummaryWithRosterFallback(
  userId: string,
  conversationHistory: HistoryMessage[]
): Promise<string> {
  const summary = await buildConversationSummary(userId, conversationHistory);
  if (!summary.includes('Characters mentioned') && conversationHistory.length > 0) {
    const roster = await fetchCharacterRoster(userId);
    if (roster.length > 0) {
      return `${summary}\n\n**People in your story:** ${roster.slice(0, 12).map((r) => r.name).join(', ')}`;
    }
  }
  return summary;
}
