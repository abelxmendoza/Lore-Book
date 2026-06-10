/**
 * Entity Dossier Service
 *
 * When the user mentions a known person or place, compose everything the
 * system has verified about them into ONE compact prompt block:
 *   - entity_facts (extracted + confirmed across conversations)
 *   - recurring moments (event_candidates involving the entity)
 *   - mention/relationship stats
 *
 * This is the grounding layer for accurate recall: instead of the model
 * piecing together fragments from retrieval, it gets the dossier up front.
 *
 * Token discipline: max 2 entities per message, 8 facts + 3 moments each.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { detectMentionedEntities } from './entityScopedRetriever';

const MAX_ENTITIES_PER_MESSAGE = 2;
const MAX_FACTS_PER_ENTITY = 8;
const MAX_MOMENTS_PER_ENTITY = 3;

interface DossierCharacter {
  id: string;
  name: string;
  alias?: string[];
  archetype?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface DossierLocation {
  id: string;
  name: string;
}

interface FactRow {
  fact: string;
  category: string;
  confidence: number;
  status: string;
}

interface MomentRow {
  canonical_title: string | null;
  recurring_activities: string[] | null;
  occurrence_count: number | null;
  continuity_strength: number | null;
  last_seen_at: string | null;
}

async function loadFacts(
  userId: string,
  entityId: string,
  entityType: 'character' | 'location'
): Promise<FactRow[]> {
  const { data } = await supabaseAdmin
    .from('entity_facts')
    .select('fact, category, confidence, status')
    .eq('user_id', userId)
    .eq('entity_id', entityId)
    .eq('entity_type', entityType)
    .eq('status', 'active')
    .order('confidence', { ascending: false })
    .limit(MAX_FACTS_PER_ENTITY);
  return (data ?? []) as FactRow[];
}

/**
 * event_candidates.dominant_entities holds `entities`-table ids, while the
 * dossier works with character/location rows — bridge via canonical name.
 */
async function loadMomentsByName(userId: string, name: string): Promise<MomentRow[]> {
  try {
    const { data: entityRows } = await supabaseAdmin
      .from('entities')
      .select('id')
      .eq('user_id', userId)
      .ilike('canonical_name', name)
      .limit(3);

    const entityIds = (entityRows ?? []).map((r: { id: string }) => r.id);
    if (entityIds.length === 0) return [];

    const { data } = await supabaseAdmin
      .from('event_candidates')
      .select('canonical_title, recurring_activities, occurrence_count, continuity_strength, last_seen_at')
      .eq('user_id', userId)
      .gte('continuity_strength', 0.5)
      .filter('dominant_entities', 'ov', `{${entityIds.join(',')}}`)
      .order('continuity_strength', { ascending: false })
      .limit(MAX_MOMENTS_PER_ENTITY);
    return (data ?? []) as MomentRow[];
  } catch {
    return [];
  }
}

function formatFacts(facts: FactRow[]): string {
  return facts
    .map(f => `  • [${f.category}] ${f.fact}`)
    .join('\n');
}

function formatMoments(moments: MomentRow[]): string {
  return moments
    .map(m => {
      const title = m.canonical_title ?? m.recurring_activities?.[0] ?? 'Recurring moment';
      const seen = m.occurrence_count ? ` — seen ${m.occurrence_count}×` : '';
      const last = m.last_seen_at ? `, last ${new Date(m.last_seen_at).toISOString().slice(0, 10)}` : '';
      return `  • ${title}${seen}${last}`;
    })
    .join('\n');
}

/**
 * Build the dossier block for entities mentioned in this message.
 * Returns null when no known entity is mentioned or nothing is on record —
 * the block is simply omitted from the prompt (sparse > fabricated).
 */
export async function buildEntityDossierBlock(
  userId: string,
  message: string,
  allCharacters: DossierCharacter[],
  allLocations: DossierLocation[]
): Promise<string | null> {
  try {
    const mentioned = detectMentionedEntities(message, allCharacters, allLocations)
      .slice(0, MAX_ENTITIES_PER_MESSAGE);
    if (mentioned.length === 0) return null;

    const sections: string[] = [];

    for (const entity of mentioned) {
      const [facts, moments] = await Promise.all([
        loadFacts(userId, entity.id, entity.type),
        loadMomentsByName(userId, entity.name),
      ]);

      if (facts.length === 0 && moments.length === 0) continue;

      const char = entity.type === 'character'
        ? allCharacters.find(c => c.id === entity.id)
        : undefined;
      const mentionCount = (char?.metadata?.mention_count as number | undefined) ?? undefined;
      const headerBits = [
        char?.archetype ? char.archetype : null,
        mentionCount ? `${mentionCount} mentions` : null,
      ].filter(Boolean).join(' · ');

      const lines: string[] = [`${entity.name}${headerBits ? ` (${headerBits})` : ''}:`];
      if (facts.length > 0) {
        lines.push('  Verified facts from your conversations:');
        lines.push(formatFacts(facts));
      }
      if (moments.length > 0) {
        lines.push('  Recurring moments:');
        lines.push(formatMoments(moments));
      }
      sections.push(lines.join('\n'));
    }

    if (sections.length === 0) return null;
    return sections.join('\n\n');
  } catch (err) {
    logger.debug({ err, userId }, 'Entity dossier build failed (non-blocking)');
    return null;
  }
}
