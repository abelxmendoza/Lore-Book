import { useCallback, useEffect, useState } from 'react';
import { listPeripherals, type RomanticPeripheral } from '../api/romanticPeripherals';
import { getMockPeripheralsForRelationship } from '../mocks/romanticPeripherals';
import { isExPartnerPeripheral } from '../lib/romanticExPartners';

/**
 * The ex-partner slice of a romantic relationship's periphery.
 *
 * Both the Timeline and Their Connections consume this same source so a
 * confirmed ex cannot appear in one surface but silently disappear from the
 * other. Empty/failing reads are non-fatal.
 */
export function useRomanticExPartners(relationshipId: string, useMocks = false): {
  exPartners: RomanticPeripheral[];
  loading: boolean;
} {
  const [exPartners, setExPartners] = useState<RomanticPeripheral[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = useMocks
        ? getMockPeripheralsForRelationship(relationshipId)
        : await listPeripherals(relationshipId);
      setExPartners(rows.filter(isExPartnerPeripheral));
    } catch {
      setExPartners([]);
    } finally {
      setLoading(false);
    }
  }, [relationshipId, useMocks]);

  useEffect(() => {
    void load();
  }, [load]);

  return { exPartners, loading };
}
