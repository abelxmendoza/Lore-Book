// =====================================================
// ROMANTIC RELATIONSHIP SCORING ENGINE  (Sprint AD)
// Purpose: enrich REAL relationships with deterministic intelligence so they
//          stop sitting at the 0.5 defaults and differentiate on real evidence.
//          No LLM calls. Pure, documented formulas. Results are persisted.
//
// PHASE 1 — write-path map (romantic_relationships):
//   relationship_type / status / is_current / is_situationship / exclusivity_status
//     ← written by romanticRelationshipDetector.saveRelationship (LLM detect)
//        and entityFactsService.llmClassifyRelationship.
//   start_date / metadata.evidence                ← detector.
//   romantic_interactions / romantic_dates        ← romanticInteractionExtractor.
//   affection/health/compat/intensity/ambiguity   ← DEFAULT 0.5, never written → THIS ENGINE.
//   green_flags/red_flags/strengths/weaknesses    ← DEFAULT [], never written  → THIS ENGINE.
//   rank_among_all / rank_among_active            ← romanticRelationshipRanking (reads affection_score).
//   obsession_score / attachment_intensity        ← NEW, stored in metadata.signals (no migration).
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { romanticRelationshipRanking } from './romanticRelationshipRanking';

const DAY = 24 * 60 * 60 * 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const r2 = (n: number) => Math.round(clamp01(n) * 100) / 100;

export interface RelationshipEvidence {
  status: string;
  relationshipType: string;
  isCurrent: boolean;
  isSituationship: boolean;
  exclusivityStatus?: string | null;
  startMs?: number | null;        // start_date or created_at
  loveReciprocated?: boolean | null;
  loveDeclared?: boolean;
  mentionCount: number;           // all-time mentions of the person
  lastMentionMs: number | null;
  interactionSentiments: number[]; // signed sentiments from romantic_interactions
  conflictCount: number;          // negative/conflict interactions
  dateCount: number;
  mentionConcentration: number;   // 0..1, this person's mentions vs the user's most-mentioned partner
}

export interface RelationshipSignals {
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  ambiguity_level: number;
  obsession_score: number;
  attachment_intensity: number;
  green_flags: string[];
  red_flags: string[];
  strengths: string[];
  weaknesses: string[];
  evidence_strength: number;        // 0..1 — drives the "Still Learning" UI state
  signal_strength: 'low' | 'moderate' | 'high';
}

const NO_CONTACT = new Set(['ghosted', 'blocked']);
const ENDED = new Set(['ended', 'ghosted', 'blocked']);

/**
 * Deterministic scoring from evidence. Every score is a documented weighted
 * blend of real signals, clamped to [0,1]. See inline comments for formulas.
 */
export function computeSignals(ev: RelationshipEvidence): RelationshipSignals {
  const now = Date.now();
  const status = ev.status.toLowerCase();
  const type = ev.relationshipType.toLowerCase();

  // ── Evidence intermediates ──────────────────────────────────────────────
  const interactions = ev.interactionSentiments;
  const n = interactions.length;
  const positives = interactions.filter(s => s > 0).length;
  const negatives = interactions.filter(s => s < 0).length;
  const positiveRatio = n > 0 ? positives / n : 0.5;          // unknown → neutral
  const conflictRatio = n > 0 ? (negatives + ev.conflictCount) / (n + ev.conflictCount) : 0;

  // Recency: 1.0 today → 0 at ~180 days since last mention.
  const recencyDays = ev.lastMentionMs ? (now - ev.lastMentionMs) / DAY : 365;
  const recencyScore = clamp01(1 - recencyDays / 180);

  // Duration: caps at 1 year of known history.
  const durationDays = ev.startMs ? Math.max(0, (now - ev.startMs) / DAY) : 0;
  const durationScore = clamp01(durationDays / 365);

  // Contact volume.
  const frequencyScore = clamp01((ev.mentionCount + n * 2 + ev.dateCount) / 30);

  // Reciprocation: explicit > nothing; declared-but-not-returned is a negative.
  const reciprocation =
    ev.loveReciprocated === true ? 1
    : ev.loveReciprocated === false ? 0.2
    : ev.loveDeclared ? 0.5
    : 0.5;

  // Status modifiers.
  const healthPenalty =
    status === 'blocked' ? 0.5
    : status === 'ghosted' ? 0.45
    : status === 'ended' ? 0.3
    : status === 'fading' ? 0.22
    : status === 'unrequited' ? 0.2
    : status === 'complicated' ? 0.15
    : status === 'on_break' || status === 'paused' ? 0.1
    : 0;
  const healthBonus = status === 'rekindled' ? 0.1 : (ev.isCurrent && status === 'active' ? 0.05 : 0);

  // ── Core scores ─────────────────────────────────────────────────────────
  // emotional_intensity: how charged the connection is (volume + sentiment magnitude).
  const sentimentMagnitude = n > 0 ? clamp01((positives + negatives) / n) : 0.3;
  const emotional_intensity = r2(0.25 + frequencyScore * 0.4 + sentimentMagnitude * 0.2 + recencyScore * 0.15);

  // affection: positive feeling toward them.
  const affection_score = r2(
    0.2 + positiveRatio * 0.35 + frequencyScore * 0.2 + recencyScore * 0.15 + reciprocation * 0.1
  );

  // compatibility: how well it works (positivity, low conflict, longevity).
  const compatibility_score = r2(
    0.3 + positiveRatio * 0.35 + (1 - conflictRatio) * 0.2 + durationScore * 0.15 - (ev.isSituationship ? 0.1 : 0)
  );

  // health: current viability after status penalties.
  const relationship_health = r2(
    0.4 + positiveRatio * 0.25 + recencyScore * 0.15 + reciprocation * 0.1 - conflictRatio * 0.25 - healthPenalty + healthBonus
  );

  // ambiguity: how undefined it is.
  const ambiguityBase =
    ev.isSituationship ? 0.7
    : ['talking', 'situationship', 'complicated', 'unrequited', 'hooking_up'].includes(type) ? 0.6
    : ['dating', 'in_love', 'lover', 'boyfriend', 'girlfriend', 'wife', 'husband'].includes(type) ? 0.2
    : 0.4;
  const exclusivityBump = ev.exclusivityStatus === 'unknown' || ev.exclusivityStatus === 'complicated' ? 0.15 : 0;
  const ambiguity_level = r2(ambiguityBase + exclusivityBump - durationScore * 0.1);

  // ── Obsession & attachment (dynamics, NOT a type) ────────────────────────
  // attachment_intensity: how emotionally hooked the user is on this person.
  const attachment_intensity = r2(
    emotional_intensity * 0.45 + ev.mentionConcentration * 0.3 + (status === 'unrequited' ? 0.15 : 0) + (recencyScore * 0.1)
  );
  // obsession_score: fixation signal — high when intensity persists despite
  // unrequited / no-contact, or one person keeps circling back.
  const stillFixatingAfterCutoff = NO_CONTACT.has(status) && recencyScore > 0.4 ? 0.3 : 0;
  const unrequitedFixation = status === 'unrequited' ? 0.25 : 0;
  const oneSided = reciprocation <= 0.2 ? 0.15 : 0;
  const obsession_score = r2(
    attachment_intensity * 0.4 + ev.mentionConcentration * 0.2 + stillFixatingAfterCutoff + unrequitedFixation + oneSided
  );

  // ── Flags (deterministic) ────────────────────────────────────────────────
  const green_flags: string[] = [];
  const red_flags: string[] = [];
  if (durationDays > 180) green_flags.push('Long-standing connection');
  if (positiveRatio > 0.7 && n >= 3) green_flags.push('Consistently positive interactions');
  if (ev.loveReciprocated === true) green_flags.push('Mutual feelings expressed');
  if (ev.isCurrent && recencyScore > 0.6) green_flags.push('Active, recent contact');
  if (ev.dateCount >= 3) green_flags.push('Shared meaningful time together');
  if (status === 'rekindled') green_flags.push('Reconnected after a break');

  if (status === 'ghosted') red_flags.push('Ghosted');
  if (status === 'blocked') red_flags.push('Blocked / cut off');
  if (conflictRatio > 0.4) red_flags.push('Frequent conflict');
  if (obsession_score >= 0.6) red_flags.push('Signs of fixation / one-sided intensity');
  if (ambiguity_level >= 0.7) red_flags.push('Highly ambiguous / undefined');
  if (ev.isSituationship && durationDays > 180) red_flags.push('Long-term situationship');
  if (status === 'unrequited') red_flags.push('One-sided / unrequited');
  if (status === 'fading') red_flags.push('Fading / losing momentum');

  // strengths/weaknesses: human-readable read of the scores.
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (compatibility_score >= 0.65) strengths.push('Strong compatibility');
  if (affection_score >= 0.65) strengths.push('High affection');
  if (relationship_health >= 0.65) strengths.push('Healthy dynamic');
  if (recencyScore > 0.6 && frequencyScore > 0.5) strengths.push('Frequent, recent connection');
  if (relationship_health < 0.4) weaknesses.push('Strained or declining');
  if (ambiguity_level >= 0.65) weaknesses.push('Undefined / unclear direction');
  if (conflictRatio > 0.4) weaknesses.push('Recurring friction');
  if (reciprocation <= 0.2) weaknesses.push('Imbalanced investment');

  // Evidence strength → "Still Learning" when low.
  const evidence_strength = r2((ev.mentionCount + n * 2 + ev.dateCount) / 12);
  const signal_strength: RelationshipSignals['signal_strength'] =
    evidence_strength >= 0.6 ? 'high' : evidence_strength >= 0.25 ? 'moderate' : 'low';

  return {
    affection_score, emotional_intensity, compatibility_score, relationship_health, ambiguity_level,
    obsession_score, attachment_intensity,
    green_flags, red_flags, strengths, weaknesses,
    evidence_strength, signal_strength,
  };
}

class RomanticRelationshipScoringService {
  /** Score + persist every romantic relationship for a user, then re-rank. */
  async scoreAllForUser(userId: string): Promise<{ scored: number }> {
    try {
      const { data: rels, error } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId);
      if (error) {
        if ((error as { code?: string }).code === 'PGRST205') return { scored: 0 };
        throw error;
      }
      if (!rels || rels.length === 0) return { scored: 0 };

      // Resolve person names (characters + omega_entities) for mention lookups.
      const charIds = rels.filter(r => r.person_type === 'character').map(r => r.person_id);
      const entIds = rels.filter(r => r.person_type === 'omega_entity').map(r => r.person_id);
      const [chars, ents] = await Promise.all([
        charIds.length ? supabaseAdmin.from('characters').select('id, name').in('id', charIds) : Promise.resolve({ data: [] as any[] }),
        entIds.length ? supabaseAdmin.from('omega_entities').select('id, name').in('id', entIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const nameById = new Map<string, string>();
      for (const c of (chars.data ?? [])) nameById.set(c.id, c.name);
      for (const e of (ents.data ?? [])) nameById.set(e.id, e.name);

      // Batch interactions for all relationships.
      const relIds = rels.map(r => r.id);
      const { data: interactions } = await supabaseAdmin
        .from('romantic_interactions')
        .select('relationship_id, sentiment, interaction_type, interaction_date')
        .in('relationship_id', relIds);
      const interByRel = new Map<string, Array<{ sentiment: number; interaction_type?: string }>>();
      for (const it of (interactions ?? [])) {
        const list = interByRel.get(it.relationship_id) ?? [];
        list.push({ sentiment: Number(it.sentiment ?? 0), interaction_type: it.interaction_type });
        interByRel.set(it.relationship_id, list);
      }

      const { data: dates } = await supabaseAdmin
        .from('romantic_dates')
        .select('relationship_id')
        .in('relationship_id', relIds);
      const dateCountByRel = new Map<string, number>();
      for (const d of (dates ?? [])) dateCountByRel.set(d.relationship_id, (dateCountByRel.get(d.relationship_id) ?? 0) + 1);

      // Mentions per person (count + last date), then concentration.
      const mentionStats = new Map<string, { count: number; lastMs: number | null }>();
      for (const rel of rels) {
        const name = nameById.get(rel.person_id) ?? (rel.metadata?.partner_name as string | undefined);
        mentionStats.set(rel.id, await this.mentionStatsFor(userId, name));
      }
      const maxMentions = Math.max(1, ...[...mentionStats.values()].map(m => m.count));

      let scored = 0;
      for (const rel of rels) {
        const ms = mentionStats.get(rel.id)!;
        const inter = interByRel.get(rel.id) ?? [];
        const conflictCount = inter.filter(i => (i.interaction_type ?? '').includes('conflict') || (i.interaction_type ?? '').includes('argument')).length;
        const ev: RelationshipEvidence = {
          status: rel.status ?? 'active',
          relationshipType: rel.relationship_type ?? 'dating',
          isCurrent: rel.is_current ?? true,
          isSituationship: rel.is_situationship ?? false,
          exclusivityStatus: rel.exclusivity_status,
          startMs: rel.start_date ? new Date(rel.start_date).getTime() : (rel.created_at ? new Date(rel.created_at).getTime() : null),
          loveReciprocated: rel.love_reciprocated,
          loveDeclared: Boolean(rel.love_declared_at),
          mentionCount: ms.count,
          lastMentionMs: ms.lastMs,
          interactionSentiments: inter.map(i => i.sentiment),
          conflictCount,
          dateCount: dateCountByRel.get(rel.id) ?? 0,
          mentionConcentration: clamp01(ms.count / maxMentions),
        };
        const s = computeSignals(ev);

        const { error: upErr } = await supabaseAdmin
          .from('romantic_relationships')
          .update({
            affection_score: s.affection_score,
            emotional_intensity: s.emotional_intensity,
            compatibility_score: s.compatibility_score,
            relationship_health: s.relationship_health,
            ambiguity_level: s.ambiguity_level,
            green_flags: s.green_flags,
            red_flags: s.red_flags,
            strengths: s.strengths,
            weaknesses: s.weaknesses,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(rel.metadata ?? {}),
              signals: {
                obsession_score: s.obsession_score,
                attachment_intensity: s.attachment_intensity,
                evidence_strength: s.evidence_strength,
                signal_strength: s.signal_strength,
                scored_at: new Date().toISOString(),
              },
            },
          })
          .eq('id', rel.id)
          .eq('user_id', userId);
        if (!upErr) scored++;
      }

      // Re-rank now that affection scores are real.
      await romanticRelationshipRanking.calculateRankings(userId).catch(() => {});

      logger.info({ userId, scored }, 'Scored romantic relationships');
      return { scored };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to score romantic relationships');
      return { scored: 0 };
    }
  }

  /** All-time mention count + most-recent mention for a person across journal/chat. */
  private async mentionStatsFor(userId: string, personName?: string | null): Promise<{ count: number; lastMs: number | null }> {
    const name = personName?.trim();
    if (!name || name.length < 2) return { count: 0, lastMs: null };
    const like = `%${name}%`;
    const [journal, omega, chat] = await Promise.all([
      supabaseAdmin.from('journal_entries').select('created_at').eq('user_id', userId).ilike('content', like).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('omega_messages').select('created_at').eq('user_id', userId).ilike('content', like).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('chat_messages').select('created_at').eq('user_id', userId).eq('role', 'user').ilike('content', like).order('created_at', { ascending: false }).limit(100),
    ]);
    const all = [...(journal.data ?? []), ...(omega.data ?? []), ...(chat.data ?? [])].map(r => new Date(r.created_at).getTime());
    return { count: all.length, lastMs: all.length ? Math.max(...all) : null };
  }
}

export const romanticRelationshipScoring = new RomanticRelationshipScoringService();
