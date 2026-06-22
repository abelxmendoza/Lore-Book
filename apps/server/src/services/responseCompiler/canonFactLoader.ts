import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import type { CanonFact } from './responseCompilerTypes';

/**
 * Real canon source for the Response Compiler.
 *
 * Grounding (Phase 2) and contradiction (Phase 5) are only meaningful when the
 * compiler can compare assistant claims against the user's *established* lore.
 * That canon lives in `omega_claims` (evidenced statements) anchored to
 * `omega_entities`. We read a bounded, high-confidence, active slice — never the
 * 1536-dim embedding (egress) — and project it into the compiler's CanonFact
 * shape. This is the line the spec draws: canon is user-originated evidence, and
 * the compiler treats the LLM as intelligent but non-authoritative against it.
 */

// Minimal projection — same egress discipline as omegaMemoryService: never
// SELECT the vector column on read paths that don't do JS cosine math.
const CLAIM_COLS = 'id, entity_id, text, confidence, is_active, updated_at, metadata';

/** Only confident, active claims are treated as canon worth contradicting. */
const CANON_CONFIDENCE_FLOOR = 0.7;
const MAX_CANON_CLAIMS = 80;

function classifyDomain(text: string): string {
  const t = text.toLowerCase();
  if (/\b(work|works|worked|employ|employed|job|career|company|robotics)\b/.test(t)) return 'work';
  if (/\b(school|college|university|studied|graduated|academy|institute|major(?:ed)?)\b/.test(t)) {
    return 'school';
  }
  if (/\b(friend|brother|sister|mother|father|mom|dad|partner|married|wife|husband|cousin|aunt|uncle|grandparent)\b/.test(t)) {
    return 'relationship';
  }
  if (/\b(lives? in|moved to|grew up|from|born in|located|based in)\b/.test(t)) return 'location';
  return 'general';
}

/**
 * Load a bounded set of canon facts for a user from durable lore.
 * Read-only and best-effort: any failure returns [] so the compiler degrades
 * to source-message grounding rather than throwing on the chat path.
 */
export async function loadUserCanonFacts(userId: string): Promise<CanonFact[]> {
  if (!userId) return [];

  try {
    const { data: claims, error } = await supabaseAdmin
      .from('omega_claims')
      .select(CLAIM_COLS)
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('confidence', CANON_CONFIDENCE_FLOOR)
      .order('updated_at', { ascending: false })
      .limit(MAX_CANON_CLAIMS);

    if (error) {
      logger.warn({ err: error, userId }, 'canonFactLoader: claim read failed');
      return [];
    }
    if (!claims || claims.length === 0) return [];

    const entityIds = [...new Set(claims.map((c) => c.entity_id).filter(Boolean))];
    const nameById = new Map<string, string>();
    if (entityIds.length > 0) {
      const { data: entities } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name')
        .in('id', entityIds);
      for (const e of entities ?? []) {
        if (e?.id && e?.primary_name) nameById.set(e.id, e.primary_name);
      }
    }

    return claims
      .filter((c) => typeof c.text === 'string' && c.text.trim().length > 0)
      .map((c) => ({
        domain: classifyDomain(c.text),
        fact: c.text.trim(),
        entityName: c.entity_id ? nameById.get(c.entity_id) : undefined,
        sourceMessageId:
          (c.metadata && typeof c.metadata === 'object'
            ? (c.metadata.source_message_id as string | undefined)
            : undefined) ?? undefined,
      }));
  } catch (err) {
    logger.warn({ err, userId }, 'canonFactLoader: unexpected failure');
    return [];
  }
}
