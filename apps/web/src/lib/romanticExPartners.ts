import type { RomanticPeripheral } from '../api/romanticPeripherals';

/**
 * Periphery extraction has used several equivalent role names over time.
 * Keep one tolerant predicate so Their Connections and Timeline agree.
 */
const EX_PARTNER_ROLES = new Set([
  'ex',
  'ex_partner',
  'former_partner',
  'ex_boyfriend',
  'ex_girlfriend',
  'ex_husband',
  'ex_wife',
  'ex_lover',
]);

function normalizeRole(role: string): string {
  return String(role ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
}

export function isExPartnerPeripheral(
  peripheral: Pick<RomanticPeripheral, 'role' | 'tier'>,
): boolean {
  return peripheral.tier !== 'dismissed' && EX_PARTNER_ROLES.has(normalizeRole(peripheral.role));
}

export function partitionRomanticPeripherals<T extends RomanticPeripheral>(
  peripherals: T[],
): { exPartners: T[]; otherConnections: T[] } {
  const exPartners: T[] = [];
  const otherConnections: T[] = [];
  for (const peripheral of peripherals) {
    (isExPartnerPeripheral(peripheral) ? exPartners : otherConnections).push(peripheral);
  }
  return { exPartners, otherConnections };
}
