// ============================================================================
// Romantic Interaction Extractor
//
// Detects when the user describes a romantic interaction in chat and logs it
// to romantic_interactions (and romantic_dates for milestones).
//
// This is the chat-native date field report. No form, no button.
// User says "I went on a date with Maya last night, it was great" and the
// system writes the interaction record automatically.
//
// Design:
//   - Purely heuristic — no LLM call. Fast, cheap, never blocks chat.
//   - Called after romanticRelationshipDetector has already confirmed a match.
//   - Receives the relationship_id and raw message text.
//   - Deduplicates via source_message_id — safe to call multiple times.
//   - Writes to romantic_interactions always.
//   - Writes to romantic_dates only for milestone-type interactions.
// ============================================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

// ─── Interaction type patterns ────────────────────────────────────────────────
// Order matters — more specific patterns first.

const INTERACTION_PATTERNS: Array<{
  type: string;
  keywords: string[];
  milestoneType?: string;
}> = [
  {
    type: 'intimate',
    keywords: ['slept with', 'spent the night', 'stayed over', 'hooked up', 'made out', 'were intimate', 'physical'],
    milestoneType: 'first_sleepover',
  },
  {
    type: 'conflict',
    keywords: ['fight', 'argument', 'argued', 'got into it', 'fight with', 'disagreed', 'drama with', 'blew up', 'blow up', 'yelled', 'yelling', 'conflict', 'falling out'],
  },
  {
    type: 'celebration',
    keywords: ['celebrated', 'anniversary', 'birthday', 'party with', 'special night'],
    milestoneType: 'anniversary',
  },
  {
    type: 'date',
    keywords: [
      'went on a date', 'had a date', 'date night', 'our date', 'dinner with', 'lunch with',
      'went out with', 'took them to', 'took me to', 'we went to', 'took her to', 'took him to',
      'date with', 'on a date', 'date last night', 'date tonight', 'on dates',
    ],
    milestoneType: 'first_date',
  },
  {
    type: 'video_call',
    keywords: ['facetime', 'video call', 'video chat', 'zoom with'],
  },
  {
    type: 'call',
    keywords: ['called', 'phone call', 'talked on the phone', 'on the phone', 'called me', 'i called'],
  },
  {
    type: 'meetup',
    keywords: [
      'hung out', 'chilled with', 'met up', 'stopped by', 'came over',
      'we were together', 'saw them', 'saw her', 'saw him', 'we met',
      'visited', 'hanging out', 'hang out',
    ],
  },
  {
    type: 'support',
    keywords: [
      'there for me', 'supported me', 'comforted me', 'helped me', 'was there when',
      'showed up for me', 'checked on me',
    ],
  },
  {
    type: 'text',
    keywords: ['texted', 'messaged', "dm'd", 'sent a message', 'got a text', 'sent me', 'they texted', 'she texted', 'he texted'],
  },
];

// ─── Sentiment extraction ─────────────────────────────────────────────────────
// Simple word-count approach, consistent with RelationshipDriftDetector.

const POSITIVE_WORDS = [
  'amazing', 'great', 'wonderful', 'fantastic', 'perfect', 'loved', 'awesome',
  'excited', 'happy', 'glad', 'good', 'nice', 'sweet', 'fun', 'laughed',
  'connected', 'close', 'intimate', 'beautiful', 'romantic', 'special', 'lovely',
  'enjoyed', 'positive', 'well', 'better', 'best', 'incredible', 'blessed',
];

const NEGATIVE_WORDS = [
  'terrible', 'awful', 'bad', 'horrible', 'sad', 'angry', 'frustrated',
  'disappointed', 'hurt', 'awkward', 'weird', 'uncomfortable', 'cold', 'distant',
  'upset', 'mad', 'annoyed', 'irritated', 'toxic', 'draining', 'exhausting',
  'confused', 'lost', 'worried', 'scared', 'nervous', 'anxious', 'regret',
];

function extractSentiment(text: string): number {
  const lower = text.toLowerCase();
  const pos = POSITIVE_WORDS.filter(w => lower.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter(w => lower.includes(w)).length;
  if (pos === 0 && neg === 0) return 0;
  return Math.max(-1, Math.min(1, (pos - neg) / Math.max(1, pos + neg) * 1.5));
}

// ─── Interaction type detection ───────────────────────────────────────────────

interface DetectedInteraction {
  interactionType: string;
  milestoneType: string | null;
  sentiment: number;
  wasPositive: boolean;
  description: string;
}

function detectInteraction(text: string): DetectedInteraction | null {
  const lower = text.toLowerCase();

  let matchedType: string | null = null;
  let milestoneType: string | null = null;

  for (const pattern of INTERACTION_PATTERNS) {
    const hit = pattern.keywords.some(kw => lower.includes(kw));
    if (hit) {
      matchedType = pattern.type;
      milestoneType = pattern.milestoneType ?? null;
      break;
    }
  }

  if (!matchedType) return null;

  const sentiment = extractSentiment(text);
  const wasPositive = sentiment >= 0;

  // Build a short description from the message (first 150 chars, trimmed)
  const description = text.trim().substring(0, 150) + (text.length > 150 ? '…' : '');

  return { interactionType: matchedType, milestoneType, sentiment, wasPositive, description };
}

// ─── Milestone guard ──────────────────────────────────────────────────────────
// Only write to romantic_dates for milestone types IF that milestone hasn't
// been recorded yet for this relationship. Prevents duplicating "first date."

async function shouldWriteMilestone(
  userId: string,
  relationshipId: string,
  milestoneType: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('romantic_dates')
    .select('id')
    .eq('user_id', userId)
    .eq('relationship_id', relationshipId)
    .eq('date_type', milestoneType)
    .limit(1);
  return !data || data.length === 0;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function extractAndLogInteraction(
  userId: string,
  relationshipId: string,
  rawText: string,
  messageId: string
): Promise<void> {
  try {
    // Dedup: skip if we've already logged an interaction for this message
    const { data: existing } = await supabaseAdmin
      .from('romantic_interactions')
      .select('id')
      .eq('user_id', userId)
      .eq('source_message_id', messageId)
      .limit(1);

    if (existing && existing.length > 0) return;

    const detected = detectInteraction(rawText);
    if (!detected) return;

    const now = new Date().toISOString();

    // Write to romantic_interactions
    await supabaseAdmin.from('romantic_interactions').insert({
      user_id:           userId,
      relationship_id:   relationshipId,
      interaction_type:  detected.interactionType,
      interaction_date:  now,
      sentiment:         detected.sentiment,
      was_positive:      detected.wasPositive,
      description:       detected.description,
      source_message_id: messageId,
    });

    logger.debug(
      { userId, relationshipId, type: detected.interactionType, sentiment: detected.sentiment },
      'romanticInteractionExtractor: logged interaction from chat'
    );

    // Write milestone to romantic_dates if applicable and not yet recorded
    if (detected.milestoneType) {
      const firstTime = await shouldWriteMilestone(userId, relationshipId, detected.milestoneType);
      if (firstTime) {
        await supabaseAdmin.from('romantic_dates').insert({
          user_id:           userId,
          relationship_id:   relationshipId,
          date_type:         detected.milestoneType,
          date_time:         now,
          description:       detected.description,
          sentiment:         detected.sentiment,
          was_positive:      detected.wasPositive,
          source_message_id: messageId,
        });

        logger.debug(
          { userId, relationshipId, milestoneType: detected.milestoneType },
          'romanticInteractionExtractor: logged first-time milestone'
        );
      }
    }

    // Auto-analytics: recalculate relationship health after every 3rd interaction.
    // Keeps scores current without requiring a manual "Calculate Affection" click.
    // Fire-and-forget — never blocks interaction logging.
    const { count } = await supabaseAdmin
      .from('romantic_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('relationship_id', relationshipId);

    if (typeof count === 'number' && count > 0 && count % 3 === 0) {
      import('../conversationCentered/romanticRelationshipAnalytics')
        .then(({ romanticRelationshipAnalytics }) =>
          romanticRelationshipAnalytics.generateAnalytics(userId, relationshipId)
        )
        .catch(err => logger.debug({ err, relationshipId }, 'Auto-analytics recalc failed (non-blocking)'));
    }
  } catch (err) {
    // Non-fatal — ingestion pipeline must never fail because of this
    logger.debug({ err, userId, relationshipId }, 'romanticInteractionExtractor: failed (non-blocking)');
  }
}
