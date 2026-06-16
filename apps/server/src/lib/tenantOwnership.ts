import { supabaseAdmin } from '../services/supabaseClient';

/** Thrown when a resource does not belong to the requesting user. Maps to 404 at route layer. */
export class TenantAccessError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'TenantAccessError';
  }
}

export async function assertOmegaEntityOwned(userId: string, entityId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('omega_entities')
    .select('id')
    .eq('id', entityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new TenantAccessError('Entity not found');
  }
}

export async function assertJournalEntryOwned(userId: string, entryId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new TenantAccessError('Entry not found');
  }
}

export async function assertMemoryComponentOwned(userId: string, componentId: string): Promise<void> {
  const { data: component, error: componentError } = await supabaseAdmin
    .from('memory_components')
    .select('journal_entry_id')
    .eq('id', componentId)
    .maybeSingle();

  if (componentError || !component) {
    throw new TenantAccessError('Component not found');
  }

  await assertJournalEntryOwned(userId, component.journal_entry_id);
}

export async function assertMemoryComponentsOwned(userId: string, componentIds: string[]): Promise<void> {
  if (componentIds.length === 0) {
    throw new TenantAccessError('Component not found');
  }

  const { data: components, error } = await supabaseAdmin
    .from('memory_components')
    .select('id, journal_entry_id')
    .in('id', componentIds);

  if (error || !components || components.length !== componentIds.length) {
    throw new TenantAccessError('Component not found');
  }

  const entryIds = [...new Set(components.map((c) => c.journal_entry_id))];
  const { data: entries, error: entriesError } = await supabaseAdmin
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .in('id', entryIds);

  if (entriesError || !entries || entries.length !== entryIds.length) {
    throw new TenantAccessError('Component not found');
  }
}
