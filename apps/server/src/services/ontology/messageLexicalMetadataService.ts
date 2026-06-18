/**
 * Compact lexical signals for chat_messages.metadata.lexical_signals.
 */
import { detectDiscourseMoves } from '../ontology/discourseStance';
import { detectNarrativeStages } from '../ontology/discourseStance';
import { parseSocialRoles } from '../ontology/socialRelationshipIntelligence';
import { parseRomanticEpisode } from '../ontology/romanticIntelligence';

export type LexicalSignalMove = {
  move: string;
  cue: string;
  confidence: number;
};

export type LexicalSignalRole = {
  role: string;
  cue: string;
  confidence: number;
  attributedToSelf: boolean;
};

export type LexicalSignalRomantic = {
  status: string;
  relationshipType: string;
  cue: string;
  confidence: number;
  isSituationship: boolean;
  tags: string[];
};

export type LexicalSignalStage = {
  stage: string;
  cue: string;
  confidence: number;
};

export type MessageLexicalSignals = {
  detector: 'lexical';
  discourse_moves: LexicalSignalMove[];
  social_roles: LexicalSignalRole[];
  romantic_signals: LexicalSignalRomantic[];
  narrative_stages: LexicalSignalStage[];
  is_story_block: boolean;
  updated_at: string;
};

function compactDiscourse(text: string): LexicalSignalMove[] {
  return detectDiscourseMoves(text)
    .slice(0, 6)
    .map((s) => ({ move: s.move, cue: s.cue, confidence: s.confidence }));
}

function compactSocial(text: string): LexicalSignalRole[] {
  return parseSocialRoles(text)
    .slice(0, 6)
    .map((s) => ({
      role: s.role,
      cue: s.cue,
      confidence: s.confidence,
      attributedToSelf: s.attributedToSelf,
    }));
}

function compactRomantic(text: string): LexicalSignalRomantic[] {
  return parseRomanticEpisode(text)
    .slice(0, 4)
    .map((h) => ({
      status: h.status,
      relationshipType: h.relationshipType,
      cue: h.cues[0] ?? h.evidence.slice(0, 40),
      confidence: h.confidence,
      isSituationship: h.isSituationship,
      tags: h.ontologyTags.slice(0, 4),
    }));
}

function compactStages(text: string): LexicalSignalStage[] {
  return detectNarrativeStages(text)
    .slice(0, 6)
    .map((s) => ({ stage: s.stage, cue: s.cue, confidence: s.confidence }));
}

/** Build additive lexical_signals payload for message metadata. */
export function buildMessageLexicalSignals(text: string): MessageLexicalSignals | null {
  if (!text?.trim()) return null;

  const discourse_moves = compactDiscourse(text);
  const social_roles = compactSocial(text);
  const romantic_signals = compactRomantic(text);
  const narrative_stages = compactStages(text);

  if (
    discourse_moves.length === 0 &&
    social_roles.length === 0 &&
    romantic_signals.length === 0 &&
    narrative_stages.length === 0
  ) {
    return null;
  }

  const is_story_block =
    narrative_stages.length >= 2 ||
    discourse_moves.some((d) => d.move === 'STORY_OPEN' || d.move === 'STORY_CLOSE');

  return {
    detector: 'lexical',
    discourse_moves,
    social_roles,
    romantic_signals,
    narrative_stages,
    is_story_block,
    updated_at: new Date().toISOString(),
  };
}

/** Merge lexical_signals into existing chat_messages metadata (non-destructive). */
export async function attachLexicalSignalsToMessage(
  messageId: string,
  userId: string,
  text: string,
): Promise<MessageLexicalSignals | null> {
  const signals = buildMessageLexicalSignals(text);
  if (!signals) return null;

  const { supabaseAdmin } = await import('../supabaseClient');
  const { data: existing } = await supabaseAdmin
    .from('chat_messages')
    .select('metadata')
    .eq('id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  const metadata = {
    ...(existing?.metadata as Record<string, unknown> ?? {}),
    lexical_signals: signals,
  };

  await supabaseAdmin
    .from('chat_messages')
    .update({ metadata })
    .eq('id', messageId)
    .eq('user_id', userId);

  return signals;
}
