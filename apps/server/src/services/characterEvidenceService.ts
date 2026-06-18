/**
 * Evidence Locker — what supports a character record.
 * Aggregates provenance edges, source files, moments, and facts without new storage.
 */
import { entityFactsService } from './entityFactsService';
import { provenanceEdgeService } from './provenance';
import type { TruthState } from './provenance/types';
import { supabaseAdmin } from './supabaseClient';
import { userFileRegistry } from './ingestion/userFileRegistry';

export type EvidenceItemKind = 'moment' | 'file' | 'fact' | 'conversation' | 'claim';

export interface EvidenceItem {
  id: string;
  kind: EvidenceItemKind;
  artifactType: string;
  label: string;
  subtitle?: string;
  createdAt: string;
  truthState?: TruthState;
  route?: string;
}

export interface CharacterEvidenceLocker {
  characterId: string;
  characterName: string;
  items: EvidenceItem[];
  totalCount: number;
  summary: string;
}

function readTruthState(meta: unknown): TruthState | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = (meta as Record<string, unknown>).truth_state;
  return typeof raw === 'string' ? (raw as TruthState) : undefined;
}

async function resolveEdgeItem(
  userId: string,
  edge: { source_id: string; source_type: string; target_id: string; target_type: string; created_at: string },
  characterId: string
): Promise<EvidenceItem | null> {
  const isSource = edge.source_id === characterId;
  const otherId = isSource ? edge.target_id : edge.source_id;
  const otherType = isSource ? edge.target_type : edge.source_type;

  switch (otherType) {
    case 'journal_entry': {
      const { data } = await supabaseAdmin
        .from('journal_entries')
        .select('id, title, content, metadata, created_at')
        .eq('user_id', userId)
        .eq('id', otherId)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        kind: 'moment',
        artifactType: 'journal_entry',
        label: data.title || String(data.content ?? '').slice(0, 80) || 'Life moment',
        subtitle: 'Journal entry',
        createdAt: data.created_at,
        truthState: readTruthState(data.metadata),
        route: '/what-ai-knows?tab=moment',
      };
    }
    case 'conversation_message':
    case 'utterance': {
      return {
        id: otherId,
        kind: 'conversation',
        artifactType: otherType,
        label: 'Chat mention',
        subtitle: otherType === 'utterance' ? 'Extracted utterance' : 'Conversation message',
        createdAt: edge.created_at,
        route: '/chat',
      };
    }
    case 'user_file':
    case 'character':
    case 'entity':
    case 'insight':
      return null;
    default:
      return null;
  }
}

async function loadSourceFileEvidence(
  userId: string,
  characterId: string,
  characterMeta: Record<string, unknown>
): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();

  const sourceFileId =
    typeof characterMeta.source_file_id === 'string' ? characterMeta.source_file_id : undefined;
  if (sourceFileId) {
    const file = await userFileRegistry.getForUser(userId, sourceFileId);
    if (file) {
      seen.add(file.id);
      items.push({
        id: file.id,
        kind: 'file',
        artifactType: 'user_file',
        label: file.filename,
        subtitle: file.mime_type,
        createdAt: file.uploaded_at,
        route: '/what-ai-knows?tab=evidence',
      });
    }
  }

  const files = await userFileRegistry.listForUser(userId);
  for (const file of files) {
    if (seen.has(file.id)) continue;
    const links = Array.isArray(file.metadata?.provenance_links)
      ? (file.metadata.provenance_links as Array<{ type?: string; id?: string }>)
      : [];
    const linksCharacter = links.some(
      (l) => l.type === 'character' && l.id === characterId
    );
    if (!linksCharacter) continue;
    seen.add(file.id);
    items.push({
      id: file.id,
      kind: 'file',
      artifactType: 'user_file',
      label: file.filename,
      subtitle: `${file.mime_type} · derived from import`,
      createdAt: file.uploaded_at,
      route: '/what-ai-knows?tab=evidence',
    });
  }

  return items;
}

async function loadMomentEvidence(userId: string, characterId: string): Promise<EvidenceItem[]> {
  const { data } = await supabaseAdmin
    .from('journal_entries')
    .select('id, title, content, metadata, created_at')
    .eq('user_id', userId)
    .contains('metadata', { character_ids: [characterId] })
    .order('created_at', { ascending: false })
    .limit(30);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: 'moment' as const,
    artifactType: 'journal_entry',
    label: row.title || String(row.content ?? '').slice(0, 80) || 'Life moment',
    subtitle: 'Linked moment',
    createdAt: row.created_at,
    truthState: readTruthState(row.metadata),
    route: '/what-ai-knows?tab=moment',
  }));
}

export async function getCharacterEvidenceLocker(
  userId: string,
  characterId: string
): Promise<CharacterEvidenceLocker | null> {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .eq('id', characterId)
    .maybeSingle();

  if (error || !character) return null;

  const meta = (character.metadata ?? {}) as Record<string, unknown>;
  const [edges, files, moments, facts] = await Promise.all([
    provenanceEdgeService.getEdgesForArtifact(characterId, userId),
    loadSourceFileEvidence(userId, characterId, meta),
    loadMomentEvidence(userId, characterId),
    entityFactsService.getEntityFacts(userId, characterId, 'character'),
  ]);

  const items: EvidenceItem[] = [...files, ...moments];
  const seen = new Set(items.map((i) => `${i.artifactType}:${i.id}`));

  for (const edge of edges) {
    const resolved = await resolveEdgeItem(userId, edge, characterId);
    if (!resolved) continue;
    const key = `${resolved.artifactType}:${resolved.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(resolved);
  }

  for (const fact of facts.slice(0, 20)) {
    const key = `entity_fact:${fact.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: fact.id,
      kind: 'fact',
      artifactType: 'entity_fact',
      label: fact.fact,
      subtitle: fact.category ?? 'Fact',
      createdAt: fact.created_at ?? new Date().toISOString(),
      route: undefined,
    });
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const fileCount = items.filter((i) => i.kind === 'file').length;
  const momentCount = items.filter((i) => i.kind === 'moment').length;
  const factCount = items.filter((i) => i.kind === 'fact').length;

  return {
    characterId,
    characterName: character.name,
    items,
    totalCount: items.length,
    summary:
      items.length === 0
        ? 'No supporting evidence linked yet — mention this person in chat or upload a document.'
        : `${momentCount} moment${momentCount === 1 ? '' : 's'}, ${fileCount} file${fileCount === 1 ? '' : 's'}, ${factCount} fact${factCount === 1 ? '' : 's'} support this record.`,
  };
}
