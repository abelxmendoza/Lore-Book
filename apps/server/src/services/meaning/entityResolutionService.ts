/**
 * Entity resolution — persons, organizations, roles against existing records.
 */
import { supabaseAdmin } from '../supabaseClient';
import { selfCharacterService } from '../selfCharacterService';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { ResolvedEntity, TemporalContext } from './meaningResolutionTypes';
import { extractClaimedName } from '../ontology/lexicalIntelligence';

function mapKind(type: string): ResolvedEntity['kind'] {
  switch (type) {
    case 'ORGANIZATION': return 'ORGANIZATION';
    case 'ROLE': return 'ROLE';
    case 'PROJECT': return 'PROJECT';
    default: return 'PERSON';
  }
}

export async function resolveEntities(
  userId: string,
  text: string,
  lexical: LexicalAnalysisResult,
  temporal: TemporalContext
): Promise<{ entities: ResolvedEntity[]; charByName: Map<string, { id: string; name: string }> }> {
  const resolved: ResolvedEntity[] = [];
  const seen = new Set<string>();

  const self = await selfCharacterService.ensureSelfCharacter(userId).catch(() => null);
  const selfId = self?.id as string | undefined;

  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId);

  const orgByName = new Map<string, { id: string; name: string }>();
  try {
    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('user_id', userId);
    for (const o of orgs ?? []) {
      orgByName.set(String(o.name ?? '').trim().toLowerCase(), { id: o.id, name: String(o.name ?? '') });
    }
  } catch {
    // organizations table may be absent in some environments
  }

  const charByName = new Map<string, { id: string; name: string }>();
  for (const c of chars ?? []) {
    charByName.set(String(c.name ?? '').trim().toLowerCase(), { id: c.id, name: String(c.name ?? '') });
  }

  const claimedName = extractClaimedName(text);

  for (const e of lexical.entities) {
    if (e.type === 'SKILL' || e.type === 'PLACE' || e.type === 'EMOTION') continue;
    const kind = mapKind(e.type);
    const key = `${kind}:${e.normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const charMatch = kind === 'PERSON' ? charByName.get(e.normalized) : undefined;
    const orgMatch = kind === 'ORGANIZATION' ? orgByName.get(e.normalized) : undefined;
    const linkedId = e.linkedEntityId;
    const linkedType = e.linkedEntityType;

    let entityId = charMatch?.id ?? orgMatch?.id;
    let resolutionReason = charMatch || orgMatch ? `matched_existing:${e.source}` : `lexical:${e.source}`;

    if (linkedId) {
      entityId = linkedId;
      resolutionReason = linkedType
        ? `user_linked:${linkedType}:${linkedId}`
        : `user_linked:${linkedId}`;
    }

    const isSelf =
      e.type === 'IDENTITY_CLAIM' ||
      (claimedName && e.normalized === claimedName.toLowerCase() && /\bis\s+me\b/i.test(text)) ||
      (selfId && (charMatch?.id === selfId || entityId === selfId));

    resolved.push({
      surface: e.surface,
      normalized: e.normalized,
      kind,
      entityId,
      isSelf,
      isUnresolved: kind === 'PERSON' && !entityId && e.confidence < 0.7,
      temporalStatus: kind === 'ORGANIZATION'
        ? temporal.statements.find((s) => s.object.toLowerCase() === e.normalized)?.status
        : undefined,
      confidence: e.confidence,
      resolutionReason,
      requiresConfirmation: linkedId ? false : isSelf || kind === 'ORGANIZATION',
    });
  }

  for (const stmt of temporal.statements) {
    if (!stmt.predicate.includes('work')) continue;
    const key = `ORGANIZATION:${stmt.object.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const orgMatch = orgByName.get(stmt.object.toLowerCase());
    const charMatch = charByName.get(stmt.object.toLowerCase());
    resolved.push({
      surface: stmt.object,
      normalized: stmt.object.toLowerCase(),
      kind: 'ORGANIZATION',
      entityId: orgMatch?.id ?? charMatch?.id,
      temporalStatus: stmt.status,
      confidence: orgMatch ? 0.9 : 0.75,
      resolutionReason: orgMatch ? 'matched_existing_org' : `temporal:${stmt.cue}`,
      requiresConfirmation: stmt.status === 'present' || stmt.status === 'future' || stmt.status === 'desired',
    });
  }

  // "I met Tony" — unresolved person candidate
  const metRe = /\b(?:met|saw|talked to|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = metRe.exec(text)) !== null) {
    const name = m[1].trim();
    const key = `PERSON:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const match = charByName.get(name.toLowerCase());
    resolved.push({
      surface: name,
      normalized: name.toLowerCase(),
      kind: 'PERSON',
      entityId: match?.id,
      isUnresolved: !match,
      confidence: match ? 0.88 : 0.55,
      resolutionReason: match ? 'matched_existing_person' : 'unresolved_person_candidate',
      requiresConfirmation: !match,
    });
  }

  return { entities: resolved, charByName };
}

export async function loadCharacterNameMatches(
  userId: string,
  name: string
): Promise<Array<{ id: string; name: string }>> {
  const norm = name.trim().toLowerCase();
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId);
  return (chars ?? []).filter((c) => String(c.name ?? '').trim().toLowerCase() === norm);
}
