/**
 * Romantic relationship dedupe + Character-Book linking.
 *
 * Self-heals the Love & Relationships data the same way the character audit
 * self-heals provenance — deterministically, no LLM:
 *   1. Link omega-backed (or orphaned) rows to an existing Character Book card
 *      by exact normalized name/alias, so every partner shows up in the book.
 *   2. Collapse duplicates — one canonical row per person, keeping the most
 *      current status and merging scores/flags/dates.
 *   3. Drop rows that are not the user's romantic partner (role labels like
 *      "Ex Lover", or evidence naming someone else's partner).
 *
 * Idempotent: running it on already-clean data makes no changes.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { isRelationshipRoleLabel } from './romanticEligibility';
import { isIndividualPersonName } from '../../utils/personNameValidation';

type RomanticRow = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  relationship_type: string | null;
  status: string | null;
  is_current: boolean | null;
  start_date: string | null;
  end_date: string | null;
  affection_score: number | null;
  emotional_intensity: number | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
  created_at: string | null;
};

export type RomanticDedupeReport = {
  scanned: number;
  linked: number;
  merged: number;
  removed: number;
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Pick the survivor of a duplicate group: current first, then most recent. */
function pickSurvivor(rows: RomanticRow[]): RomanticRow {
  return [...rows].sort((a, b) => {
    if (!!b.is_current !== !!a.is_current) return b.is_current ? 1 : -1;
    const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    return bt - at;
  })[0];
}

class RomanticRelationshipDedupeService {
  async dedupeAndLink(userId: string): Promise<RomanticDedupeReport> {
    const report: RomanticDedupeReport = { scanned: 0, linked: 0, merged: 0, removed: 0 };

    const { data: rowsData, error } = await supabaseAdmin
      .from('romantic_relationships')
      .select(
        'id, person_id, person_type, relationship_type, status, is_current, start_date, end_date, affection_score, emotional_intensity, metadata, updated_at, created_at'
      )
      .eq('user_id', userId);
    if (error) {
      if ((error as { code?: string }).code === 'PGRST205') return report; // table not migrated
      throw error;
    }
    let rows = (rowsData ?? []) as RomanticRow[];
    report.scanned = rows.length;
    if (rows.length === 0) return report;

    // Build a card name/alias -> id index for linking.
    const { data: cards } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('user_id', userId)
      .neq('status', 'archived');
    const cardByName = new Map<string, string>();
    for (const c of (cards ?? []) as { id: string; name: string; alias: string[] | null }[]) {
      if (c.name?.trim()) cardByName.set(normalizeName(c.name), c.id);
      for (const a of c.alias ?? []) {
        if (typeof a === 'string' && a.trim()) cardByName.set(normalizeName(a), c.id);
      }
    }
    const cardIds = new Set((cards ?? []).map((c: { id: string }) => c.id));

    // Resolve a display name for each row (card name, omega primary_name, metadata).
    const omegaIds = [...new Set(rows.filter((r) => r.person_type === 'omega_entity').map((r) => r.person_id))];
    const omegaNameById = new Map<string, string>();
    if (omegaIds.length > 0) {
      const { data: omega } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name')
        .eq('user_id', userId)
        .in('id', omegaIds);
      for (const o of (omega ?? []) as { id: string; primary_name: string }[]) {
        if (o.primary_name?.trim()) omegaNameById.set(o.id, o.primary_name.trim());
      }
    }
    const cardNameById = new Map<string, string>();
    for (const c of (cards ?? []) as { id: string; name: string }[]) cardNameById.set(c.id, c.name);

    const nameFor = (r: RomanticRow): string => {
      if (r.person_type === 'character') return cardNameById.get(r.person_id) ?? '';
      return (
        omegaNameById.get(r.person_id) ??
        (typeof r.metadata?.partner_name === 'string' ? r.metadata.partner_name : '') ??
        ''
      );
    };

    // 1) Remove rows whose NAME is clear junk — a relationship role label
    //    ("Ex Lover") or a non-individual. Deliberately name-only: third-party
    //    evidence cues are for PREVENTING new rows, not retroactively deleting
    //    existing ones the user may have curated (a row may carry "she's taken"
    //    evidence yet still be a relationship the user keeps).
    const survivors: RomanticRow[] = [];
    for (const r of rows) {
      const name = nameFor(r);
      if (name && (isRelationshipRoleLabel(name) || !isIndividualPersonName(name))) {
        const { error: delErr } = await supabaseAdmin
          .from('romantic_relationships')
          .delete()
          .eq('id', r.id)
          .eq('user_id', userId);
        if (!delErr) report.removed += 1;
        continue;
      }
      survivors.push(r);
    }
    rows = survivors;

    // 2) Link omega / orphaned rows to a Character Book card by name.
    for (const r of rows) {
      const needsLink =
        r.person_type === 'omega_entity' ||
        (r.person_type === 'character' && !cardIds.has(r.person_id));
      if (!needsLink) continue;
      const cardId = cardByName.get(normalizeName(nameFor(r)));
      if (!cardId || cardId === r.person_id) continue;
      const { error: linkErr } = await supabaseAdmin
        .from('romantic_relationships')
        .update({
          person_type: 'character',
          person_id: cardId,
          metadata: {
            ...(r.metadata ?? {}),
            linked_character_id: cardId,
            linked_from_person_type: r.person_type,
            linked_from_person_id: r.person_id,
            linked_at: new Date().toISOString(),
          },
        })
        .eq('id', r.id)
        .eq('user_id', userId);
      if (!linkErr) {
        report.linked += 1;
        r.person_type = 'character';
        r.person_id = cardId;
      }
    }

    // 3) Collapse duplicates: one row per (person_type, person_id).
    const groups = new Map<string, RomanticRow[]>();
    for (const r of rows) {
      const key = `${r.person_type}:${r.person_id}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const survivor = pickSurvivor(group);
      const losers = group.filter((g) => g.id !== survivor.id);

      const merged = {
        affection_score: Math.max(...group.map((g) => num(g.affection_score))) || survivor.affection_score,
        emotional_intensity:
          Math.max(...group.map((g) => num(g.emotional_intensity))) || survivor.emotional_intensity,
        start_date: group
          .map((g) => g.start_date)
          .filter(Boolean)
          .sort()[0] ?? survivor.start_date,
        metadata: {
          ...(survivor.metadata ?? {}),
          dedupe_merged_from: losers.map((l) => l.id),
          dedupe_merged_at: new Date().toISOString(),
        },
      };
      await supabaseAdmin
        .from('romantic_relationships')
        .update(merged)
        .eq('id', survivor.id)
        .eq('user_id', userId);
      const { error: delErr } = await supabaseAdmin
        .from('romantic_relationships')
        .delete()
        .in('id', losers.map((l) => l.id))
        .eq('user_id', userId);
      if (!delErr) report.merged += losers.length;
    }

    return report;
  }
}

export const romanticRelationshipDedupeService = new RomanticRelationshipDedupeService();
export { RomanticRelationshipDedupeService, normalizeName, pickSurvivor };
