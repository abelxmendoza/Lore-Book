/**
 * Phase 4 — detect unknowns: mentioned entities without profiles, missing relationships, etc.
 */
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import type { TrustDomain, UnknownGap } from './trustTypes';

export async function detectUnknowns(userId: string): Promise<UnknownGap[]> {
  const gaps: UnknownGap[] = [];

  const [
    { data: knowledgeGaps },
    { data: omegaPeople },
    { data: characters },
    { data: locations },
    { data: projects },
    { data: projectSuggestions },
  ] = await Promise.all([
    supabaseAdmin
      .from('knowledge_gaps')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(30),
    supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, type, mention_count')
      .eq('user_id', userId)
      .in('type', ['PERSON', 'CHARACTER'])
      .gte('mention_count', 1)
      .limit(100),
    supabaseAdmin.from('characters').select('id, name').eq('user_id', userId).neq('status', 'archived'),
    supabaseAdmin.from('locations').select('id, name').eq('user_id', userId),
    supabaseAdmin.from('projects').select('id, name, normalized_name').eq('user_id', userId),
    supabaseAdmin
      .from('project_suggestions')
      .select('id, name, confidence')
      .eq('user_id', userId)
      .eq('status_row', 'pending')
      .limit(20),
  ]);

  const charKeys = new Set((characters ?? []).map((c) => normalizeNameKey(c.name)));
  for (const row of knowledgeGaps ?? []) {
    gaps.push({
      id: row.id,
      kind: row.gap_type === 'sparse_entity' ? 'sparse_entity' : 'mentioned_person_no_profile',
      label: row.label,
      prompt: row.prompt,
      domain: 'characters',
      priority: row.gap_type === 'unknown_entity' ? 85 : 55,
      metadata: { source: 'knowledge_gaps' },
    });
  }

  for (const ent of omegaPeople ?? []) {
    const key = normalizeNameKey(ent.primary_name);
    if (!key || charKeys.has(key)) continue;
    gaps.push({
      id: `omega-person-${ent.id}`,
      kind: 'mentioned_person_no_profile',
      label: ent.primary_name,
      prompt: `Tell me more about ${ent.primary_name} — who are they to you?`,
      domain: 'characters',
      priority: 70 + Math.min(20, Number(ent.mention_count ?? 1) * 3),
      metadata: { omega_entity_id: ent.id, mention_count: ent.mention_count },
    });
  }

  const locKeys = new Set((locations ?? []).map((l) => normalizeNameKey(l.name)));
  const { data: omegaPlaces } = await supabaseAdmin
    .from('omega_entities')
    .select('id, primary_name, mention_count')
    .eq('user_id', userId)
    .eq('entity_type', 'LOCATION')
    .gte('mention_count', 1)
    .limit(50);

  for (const place of omegaPlaces ?? []) {
    const key = normalizeNameKey(place.primary_name);
    if (!key || locKeys.has(key)) continue;
    gaps.push({
      id: `omega-place-${place.id}`,
      kind: 'mentioned_place_no_location',
      label: place.primary_name,
      prompt: `What is ${place.primary_name} in your life?`,
      domain: 'locations',
      priority: 60 + Math.min(15, Number(place.mention_count ?? 1) * 2),
      metadata: { omega_entity_id: place.id },
    });
  }

  const projectKeys = new Set(
    (projects ?? []).flatMap((p) => [normalizeNameKey(p.name), p.normalized_name].filter(Boolean))
  );
  for (const s of projectSuggestions ?? []) {
    const key = normalizeNameKey(s.name);
    if (projectKeys.has(key)) continue;
    gaps.push({
      id: `project-sug-${s.id}`,
      kind: 'mentioned_project_no_card',
      label: s.name,
      prompt: `Is "${s.name}" an active project in your life right now?`,
      domain: 'projects',
      priority: 65 + Math.round(Number(s.confidence ?? 0.5) * 20),
      metadata: { suggestion_id: s.id },
    });
  }

  const { data: rels } = await supabaseAdmin
    .from('character_relationships')
    .select('source_character_id, target_character_id')
    .eq('user_id', userId);

  const charIdsWithRel = new Set<string>();
  for (const r of rels ?? []) {
    charIdsWithRel.add(r.source_character_id);
    charIdsWithRel.add(r.target_character_id);
  }

  for (const c of characters ?? []) {
    if (charIdsWithRel.has(c.id)) continue;
    gaps.push({
      id: `no-rel-${c.id}`,
      kind: 'no_relationship',
      label: c.name,
      prompt: `How do you know ${c.name}? What's your relationship?`,
      domain: 'relationships',
      priority: 45,
      metadata: { character_id: c.id },
    });
  }

  return gaps.sort((a, b) => b.priority - a.priority).slice(0, 50);
}
