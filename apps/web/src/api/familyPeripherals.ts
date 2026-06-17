import { fetchJson } from '../lib/api';
import type { RelationshipPeripheral, RelationshipPeripheryDomain } from './characterPeripherals';

export async function listFamilyPeripherals(
  domain: RelationshipPeripheryDomain | 'family' = 'family'
): Promise<RelationshipPeripheral[]> {
  const res = await fetchJson<{ success: boolean; peripherals: RelationshipPeripheral[] }>(
    `/api/family/peripherals?domain=${domain}`
  );
  return res.peripherals ?? [];
}
