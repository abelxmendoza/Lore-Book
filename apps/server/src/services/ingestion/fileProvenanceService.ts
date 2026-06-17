/**
 * Resolve provenance links on user_files into human-readable lore references.
 */
import { supabaseAdmin } from '../supabaseClient';
import { userFileRegistry } from './userFileRegistry';

export type ProvenanceLink = {
  type: string;
  id: string;
  label: string;
  route?: string;
};

export async function resolveFileProvenance(
  userId: string,
  fileId: string
): Promise<{ fileId: string; links: ProvenanceLink[] }> {
  const file = await userFileRegistry.getForUser(userId, fileId);
  if (!file) {
    return { fileId, links: [] };
  }

  const meta = (file.metadata ?? {}) as Record<string, unknown>;
  const rawLinks = Array.isArray(meta.provenance_links)
    ? (meta.provenance_links as Array<{ type: string; id: string }>)
    : [];

  const links: ProvenanceLink[] = [];

  for (const link of rawLinks) {
    const resolved = await resolveLink(userId, link.type, link.id);
    if (resolved) links.push(resolved);
  }

  return { fileId, links };
}

async function resolveLink(
  userId: string,
  type: string,
  id: string
): Promise<ProvenanceLink | null> {
  switch (type) {
    case 'journal_entry': {
      const { data } = await supabaseAdmin
        .from('journal_entries')
        .select('id, summary, content, date')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      if (!data) return { type, id, label: 'Life log entry' };
      const label = data.summary || String(data.content ?? '').slice(0, 80) || 'Life log entry';
      return { type, id, label, route: '/events' };
    }
    case 'resolved_event':
    case 'event': {
      const { data } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      return {
        type: 'timeline_event',
        id,
        label: data?.title ?? 'Timeline event',
        route: '/timeline',
      };
    }
    case 'entity_fact':
    case 'profile_claim': {
      const table = type === 'entity_fact' ? 'entity_facts' : 'profile_claims';
      const col = type === 'entity_fact' ? 'fact' : 'claim_text';
      const { data } = await supabaseAdmin
        .from(table)
        .select(`id, ${col}`)
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      const label = data ? String((data as Record<string, string>)[col]) : type === 'entity_fact' ? 'Fact' : 'Claim';
      return { type, id, label };
    }
    case 'resume_document': {
      const { data } = await supabaseAdmin
        .from('resume_documents')
        .select('id, file_name')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();
      return {
        type,
        id,
        label: data?.file_name ?? 'Resume',
        route: '/documents',
      };
    }
    default:
      return { type, id, label: type.replace(/_/g, ' ') };
  }
}
