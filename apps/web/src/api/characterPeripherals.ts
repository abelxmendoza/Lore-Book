import { fetchJson } from '../lib/api';
import type { RomanticPeripheral } from './romanticPeripherals';

export type RelationshipPeripheryDomain =
  | 'romantic'
  | 'family'
  | 'social'
  | 'professional'
  | 'mentor'
  | 'adversarial'
  | 'creative';

export type RelationshipPeripheral = RomanticPeripheral & {
  domain: RelationshipPeripheryDomain;
};

export async function listCharacterPeripherals(
  characterId: string,
  domain?: RelationshipPeripheryDomain
): Promise<RelationshipPeripheral[]> {
  const qs = domain ? `?domain=${domain}` : '';
  const res = await fetchJson<{ success: boolean; peripherals: RelationshipPeripheral[] }>(
    `/api/characters/${characterId}/peripherals${qs}`
  );
  return res.peripherals ?? [];
}

export async function confirmCharacterPeripheral(
  characterId: string,
  peripheralId: string
): Promise<RelationshipPeripheral> {
  const res = await fetchJson<{ success: boolean; peripheral: RelationshipPeripheral }>(
    `/api/characters/${characterId}/peripherals/${peripheralId}/confirm`,
    { method: 'POST' }
  );
  return res.peripheral;
}

export async function dismissCharacterPeripheral(
  characterId: string,
  peripheralId: string
): Promise<RelationshipPeripheral> {
  const res = await fetchJson<{ success: boolean; peripheral: RelationshipPeripheral }>(
    `/api/characters/${characterId}/peripherals/${peripheralId}/dismiss`,
    { method: 'POST' }
  );
  return res.peripheral;
}

export async function promoteCharacterPeripheral(
  characterId: string,
  peripheralId: string
): Promise<{ peripheral: RelationshipPeripheral; characterId: string }> {
  return fetchJson(
    `/api/characters/${characterId}/peripherals/${peripheralId}/promote`,
    { method: 'POST' }
  );
}
