import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Loader2,
  UserPlus,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { useMockData } from '../../contexts/MockDataContext';
import {
  confirmCharacterPeripheral,
  dismissCharacterPeripheral,
  promoteCharacterPeripheral,
  type RelationshipPeripheral,
  type RelationshipPeripheryDomain,
} from '../../api/characterPeripherals';
import { listFamilyPeripherals } from '../../api/familyPeripherals';
import { getMockFamilyPeripherals } from '../../mocks/familyPeripherals';

const DOMAIN_LABELS: Record<RelationshipPeripheryDomain, string> = {
  romantic: 'Romantic',
  family: 'Family',
  social: 'Social',
  professional: 'Work',
  mentor: 'Mentor',
  adversarial: 'Conflict',
  creative: 'Creative',
};

type FamilyExtendedNetworkPanelProps = {
  onMemberClick?: (characterId: string, name: string) => void;
};

function tierBadge(tier: RelationshipPeripheral['tier']) {
  if (tier === 'confirmed') {
    return (
      <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
        Confirmed
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
      Suspected
    </Badge>
  );
}

export function FamilyExtendedNetworkPanel({ onMemberClick }: FamilyExtendedNetworkPanelProps) {
  const { useMockData: useMocks } = useMockData();
  const [peripherals, setPeripherals] = useState<RelationshipPeripheral[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState<RelationshipPeripheryDomain | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (useMocks) {
        setPeripherals(getMockFamilyPeripherals('family'));
      } else {
        const rows = await listFamilyPeripherals('family');
        setPeripherals(rows);
      }
    } catch (err) {
      console.error('Failed to load family periphery', err);
      setPeripherals([]);
    } finally {
      setLoading(false);
    }
  }, [useMocks]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = peripherals.filter((p) => domainFilter === 'all' || p.domain === domainFilter);

  const grouped = useMemo(() => {
    const map = new Map<string, { anchorName: string; rows: RelationshipPeripheral[] }>();
    for (const p of filtered) {
      const key = p.anchor_person_id;
      const entry = map.get(key) ?? { anchorName: p.anchor_name ?? key, rows: [] };
      entry.rows.push(p);
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].rows.length - a[1].rows.length);
  }, [filtered]);

  const availableDomains = [...new Set(peripherals.map((p) => p.domain))] as RelationshipPeripheryDomain[];

  const runAction = async (
    anchorId: string,
    id: string,
    action: 'confirm' | 'dismiss' | 'promote'
  ) => {
    if (useMocks) {
      setPeripherals((prev) =>
        prev
          .map((p) => {
            if (p.id !== id) return p;
            if (action === 'dismiss') return { ...p, tier: 'dismissed' as const };
            if (action === 'confirm') return { ...p, tier: 'confirmed' as const };
            return { ...p, tier: 'confirmed' as const, peripheral_person_id: `char-${id}` };
          })
          .filter((p) => p.tier !== 'dismissed')
      );
      return;
    }

    setActionId(id);
    try {
      if (action === 'confirm') await confirmCharacterPeripheral(anchorId, id);
      else if (action === 'dismiss') await dismissCharacterPeripheral(anchorId, id);
      else await promoteCharacterPeripheral(anchorId, id);
      await load();
    } catch (err) {
      console.error(`Family peripheral ${action} failed`, err);
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-white/50" data-testid="family-periphery-loading">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        Scanning extended family mentions…
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="family-extended-network-panel">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
        <div className="flex items-start gap-3">
          <GitBranch className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-white font-medium">Extended family &amp; mentions</h3>
            <p className="text-sm text-white/60 mt-1">
              Relatives and kin mentioned vicariously through your family — sisters, in-laws, cousins, and more —
              surfaced from chat hearsay.
            </p>
          </div>
        </div>
      </div>

      {availableDomains.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={domainFilter === 'all' ? 'default' : 'outline'}
            onClick={() => setDomainFilter('all')}
          >
            All
          </Button>
          {availableDomains.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={domainFilter === d ? 'default' : 'outline'}
              onClick={() => setDomainFilter(d)}
            >
              {DOMAIN_LABELS[d]}
            </Button>
          ))}
        </div>
      )}

      {grouped.length === 0 ? (
        <div
          className="text-center text-white/50 py-12 rounded-xl border border-dashed border-white/10"
          data-testid="family-periphery-empty"
        >
          <EyeOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No extended family mentions detected yet.</p>
          <p className="text-xs mt-2">Talk about relatives in chat — e.g. &quot;Mom&apos;s sister Rosa&quot; — to surface links.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([anchorId, { anchorName, rows }]) => (
            <section key={anchorId} data-testid={`family-periphery-anchor-${anchorId}`}>
              <button
                type="button"
                onClick={() => onMemberClick?.(anchorId, anchorName)}
                className="text-sm font-medium text-emerald-200 hover:text-emerald-100 mb-3 flex items-center gap-2"
              >
                Via {anchorName}
                <span className="text-white/40 font-normal">({rows.length})</span>
              </button>
              <ul className="space-y-3">
                {rows.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-white/10 bg-black/30 p-4"
                    data-testid={`family-peripheral-card-${p.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-white font-medium">
                            {p.peripheral_name ?? p.peripheral_surface}
                          </span>
                          {tierBadge(p.tier)}
                          <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                            {DOMAIN_LABELS[p.domain]}
                          </Badge>
                        </div>
                        <p className="text-sm text-white/50 mt-1 flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {p.role.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <span className="text-sm text-white/40">{Math.round(p.confidence * 100)}%</span>
                    </div>

                    {p.metadata?.lexical_evidence && (
                      <blockquote className="mt-3 text-sm text-white/70 border-l-2 border-emerald-500/40 pl-3 italic">
                        {p.metadata.lexical_evidence}
                      </blockquote>
                    )}

                    <div className="flex flex-wrap gap-2 mt-4">
                      {p.tier === 'suspected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-500/40 text-green-300 hover:bg-green-500/10"
                          disabled={actionId === p.id}
                          onClick={() => void runAction(anchorId, p.id, 'confirm')}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Confirm
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/20"
                        disabled={actionId === p.id || Boolean(p.peripheral_person_id)}
                        onClick={() => void runAction(anchorId, p.id, 'promote')}
                      >
                        <UserPlus className="w-4 h-4 mr-1" />
                        {p.peripheral_person_id ? 'In Character Book' : 'Add to Character Book'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-white/50 hover:text-red-300"
                        disabled={actionId === p.id}
                        onClick={() => void runAction(anchorId, p.id, 'dismiss')}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Dismiss
                      </Button>
                    </div>

                    {p.tier === 'suspected' && (
                      <p className="text-xs text-amber-400/80 mt-3 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Vicarious kin mention — not yet a direct relationship in your graph.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
