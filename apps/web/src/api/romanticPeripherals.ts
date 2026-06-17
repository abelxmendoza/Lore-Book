import { fetchJson } from '../lib/api';

export type RomanticPeripheral = {
  id: string;
  anchor_relationship_id: string | null;
  anchor_person_id: string;
  anchor_person_type: 'character' | 'omega_entity';
  peripheral_person_id: string | null;
  peripheral_person_type: 'character' | 'omega_entity' | null;
  peripheral_surface: string;
  domain?: 'romantic' | 'family' | 'social' | 'professional' | 'mentor' | 'adversarial' | 'creative';
  role: string;
  tier: 'suspected' | 'confirmed' | 'dismissed';
  confidence: number;
  has_met: boolean;
  proximity: string;
  associated_via: string;
  source_message_ids: string[];
  metadata?: {
    lexical_evidence?: string;
    glossary_cues?: string[];
    ontology_tags?: string[];
    anchor_name?: string;
  };
  anchor_name?: string;
  peripheral_name?: string;
  created_at?: string;
  updated_at?: string;
};

export async function listPeripherals(relationshipId: string): Promise<RomanticPeripheral[]> {
  const res = await fetchJson<{ success: boolean; peripherals: RomanticPeripheral[] }>(
    `/api/conversation/romantic-relationships/${relationshipId}/peripherals`
  );
  return res.peripherals ?? [];
}

export async function confirmPeripheral(
  relationshipId: string,
  peripheralId: string
): Promise<RomanticPeripheral> {
  const res = await fetchJson<{ success: boolean; peripheral: RomanticPeripheral }>(
    `/api/conversation/romantic-relationships/${relationshipId}/peripherals/${peripheralId}/confirm`,
    { method: 'POST' }
  );
  return res.peripheral;
}

export async function dismissPeripheral(
  relationshipId: string,
  peripheralId: string
): Promise<RomanticPeripheral> {
  const res = await fetchJson<{ success: boolean; peripheral: RomanticPeripheral }>(
    `/api/conversation/romantic-relationships/${relationshipId}/peripherals/${peripheralId}/dismiss`,
    { method: 'POST' }
  );
  return res.peripheral;
}

export async function promotePeripheral(
  relationshipId: string,
  peripheralId: string
): Promise<{ peripheral: RomanticPeripheral; characterId: string }> {
  return fetchJson(
    `/api/conversation/romantic-relationships/${relationshipId}/peripherals/${peripheralId}/promote`,
    { method: 'POST' }
  );
}
