import { supabaseAdmin } from '../supabaseClient';
import {
  applyAttributionCorrection,
  type AttributionCorrectionInput,
  type AttributionCorrectionResult,
} from './eventAttributionCorrections';
import { explainEventEntityAttribution } from './eventAttributionDiagnostics';

export async function correctResolvedEventAttribution(
  userId: string,
  eventId: string,
  input: AttributionCorrectionInput,
): Promise<AttributionCorrectionResult | null> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, people, locations, metadata')
    .eq('user_id', userId)
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const next = applyAttributionCorrection(
    {
      id: data.id as string,
      people: (data.people as string[] | null) ?? [],
      locations: (data.locations as string[] | null) ?? [],
      metadata: (data.metadata as Record<string, unknown> | null) ?? {},
    },
    input,
  );

  const { error: updateError } = await supabaseAdmin
    .from('resolved_events')
    .update({
      people: next.people,
      locations: next.locations,
      metadata: next.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', eventId);
  if (updateError) throw updateError;
  return next;
}

export async function diagnoseResolvedEventAttribution(
  userId: string,
  eventId: string,
  entityId: string,
  opts?: { entityName?: string; entityKind?: 'character' | 'location' },
) {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, people, locations, metadata')
    .eq('user_id', userId)
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return explainEventEntityAttribution({
    event: {
      id: data.id as string,
      title: data.title as string | null,
      summary: data.summary as string | null,
      people: (data.people as string[] | null) ?? [],
      locations: (data.locations as string[] | null) ?? [],
      metadata: (data.metadata as Record<string, unknown> | null) ?? {},
    },
    entityId,
    entityName: opts?.entityName,
    entityKind: opts?.entityKind,
  });
}
