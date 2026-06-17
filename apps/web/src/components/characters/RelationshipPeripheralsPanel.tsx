// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
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
  listCharacterPeripherals,
  promoteCharacterPeripheral,
  type RelationshipPeripheral,
  type RelationshipPeripheryDomain,
} from '../../api/characterPeripherals';
import {
  confirmPeripheral,
  dismissPeripheral,
  listPeripherals,
  promotePeripheral,
} from '../../api/romanticPeripherals';
import { getMockPeripheralsForCharacter } from '../../mocks/characterPeripherals';
import { getMockPeripheralsForRelationship } from '../../mocks/romanticPeripherals';

export type PeripheryAnchorKind = 'character' | 'romantic_relationship';

type RelationshipPeripheralsPanelProps = {
  anchorKind: PeripheryAnchorKind;
  anchorId: string;
  anchorName: string;
  title?: string;
  description?: string;
  domainFilter?: RelationshipPeripheryDomain | 'all';
  onUpdate?: () => void;
};

const DOMAIN_LABELS: Record<RelationshipPeripheryDomain, string> = {
  romantic: 'Romantic',
  family: 'Family',
  social: 'Social',
  professional: 'Work',
  mentor: 'Mentor',
  adversarial: 'Conflict',
  creative: 'Creative',
};

const ROLE_LABELS: Record<string, string> = {
  side_partner: 'Side partner',
  current_partner: 'Other partner',
  ex: 'Ex',
  crush: 'Crush',
  roommate: 'Roommate',
  close_friend: 'Close friend',
  extended_family: 'Family',
  step_parent: 'Step-parent',
  manager: 'Manager',
  colleague: 'Colleague',
  mentor: 'Mentor',
  coach: 'Coach',
  therapist: 'Therapist',
  ally: 'Ally',
  instigator: 'Instigator',
  collaborator: 'Collaborator',
  unknown: 'Unknown',
};

const PROXIMITY_LABELS: Record<string, string> = {
  direct: 'You met them',
  indirect: 'Indirect connection',
  distant: 'Distant',
  unmet: 'Never met',
  third_party: 'Hearsay only',
};

function tierBadge(tier: RelationshipPeripheral['tier']) {
  if (tier === 'confirmed') {
    return (
      <Badge className="bg-green-500/20 text-green-300 border-green-500/30" data-testid="peripheral-tier-confirmed">
        Confirmed
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30" data-testid="peripheral-tier-suspected">
      Suspected
    </Badge>
  );
}

export function RelationshipPeripheralsPanel({
  anchorKind,
  anchorId,
  anchorName,
  title = 'Their network',
  description,
  domainFilter = 'all',
  onUpdate,
}: RelationshipPeripheralsPanelProps) {
  const { useMockData: useMocks } = useMockData();
  const [peripherals, setPeripherals] = useState<RelationshipPeripheral[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'suspected' | 'confirmed'>('all');
  const [domainTab, setDomainTab] = useState<RelationshipPeripheryDomain | 'all'>(domainFilter);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (useMocks) {
        const rows =
          anchorKind === 'character'
            ? getMockPeripheralsForCharacter(anchorId)
            : getMockPeripheralsForRelationship(anchorId);
        setPeripherals(rows as RelationshipPeripheral[]);
      } else if (anchorKind === 'character') {
        const rows = await listCharacterPeripherals(
          anchorId,
          domainTab === 'all' ? undefined : domainTab
        );
        setPeripherals(rows);
      } else {
        const rows = await listPeripherals(anchorId);
        setPeripherals(rows as RelationshipPeripheral[]);
      }
    } catch (err) {
      console.error('Failed to load periphery', err);
      setPeripherals([]);
    } finally {
      setLoading(false);
    }
  }, [anchorId, anchorKind, domainTab, useMocks]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (id: string, action: 'confirm' | 'dismiss' | 'promote') => {
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
      onUpdate?.();
      return;
    }

    setActionId(id);
    try {
      if (anchorKind === 'character') {
        if (action === 'confirm') await confirmCharacterPeripheral(anchorId, id);
        else if (action === 'dismiss') await dismissCharacterPeripheral(anchorId, id);
        else await promoteCharacterPeripheral(anchorId, id);
      } else {
        if (action === 'confirm') await confirmPeripheral(anchorId, id);
        else if (action === 'dismiss') await dismissPeripheral(anchorId, id);
        else await promotePeripheral(anchorId, id);
      }
      await load();
      onUpdate?.();
    } catch (err) {
      console.error(`Peripheral ${action} failed`, err);
    } finally {
      setActionId(null);
    }
  };

  const filtered = peripherals.filter((p) => {
    if (filter !== 'all' && p.tier !== filter) return false;
    if (domainTab !== 'all' && p.domain !== domainTab) return false;
    if (anchorKind === 'character' && domainFilter !== 'all' && p.domain !== domainFilter) return false;
    return true;
  });

  const availableDomains = [...new Set(peripherals.map((p) => p.domain).filter(Boolean))] as RelationshipPeripheryDomain[];

  if (loading) {
    return (
      <div className="text-center text-white/60 py-12" data-testid="relationship-peripherals-loading">
        <GitBranch className="w-10 h-10 mx-auto mb-3 text-primary/50 animate-pulse" />
        <p>Scanning their network…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="relationship-peripherals-panel">
      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-start gap-3">
          <GitBranch className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h3 className="text-white font-medium">{title}</h3>
            <p className="text-sm text-white/60 mt-1">
              {description ??
                `Other people connected to ${anchorName} — family, friends, work, and more — surfaced from chat hearsay and possessive mentions.`}
            </p>
          </div>
        </div>
      </div>

      {anchorKind === 'character' && availableDomains.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={domainTab === 'all' ? 'default' : 'outline'}
            onClick={() => setDomainTab('all')}
            data-testid="peripheral-domain-all"
          >
            All domains
          </Button>
          {availableDomains.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={domainTab === d ? 'default' : 'outline'}
              onClick={() => setDomainTab(d)}
              data-testid={`peripheral-domain-${d}`}
            >
              {DOMAIN_LABELS[d]}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['all', 'suspected', 'confirmed'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            className={filter === f ? 'bg-primary hover:bg-primary/90' : 'border-white/20'}
            onClick={() => setFilter(f)}
            data-testid={`peripheral-filter-${f}`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          className="text-center text-white/50 py-10 rounded-xl border border-dashed border-white/10"
          data-testid="relationship-peripherals-empty"
        >
          <EyeOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No vicarious connections detected for {anchorName} yet.</p>
          <p className="text-xs mt-2">Mention their family, friends, or coworkers in chat to surface links.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-white/10 bg-gradient-to-br from-black/40 to-black/20 p-4"
              data-testid={`peripheral-card-${p.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg text-white font-medium">
                      {p.peripheral_name ?? p.peripheral_surface}
                    </span>
                    {tierBadge(p.tier)}
                    {p.domain && (
                      <Badge variant="outline" className="text-xs border-white/20 text-white/60">
                        {DOMAIN_LABELS[p.domain] ?? p.domain}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs border-white/20 text-white/70">
                      {ROLE_LABELS[p.role] ?? p.role}
                    </Badge>
                  </div>
                  <p className="text-sm text-white/50 mt-1 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {PROXIMITY_LABELS[p.proximity] ?? p.proximity}
                    {!p.has_met && ' · unmet'}
                  </p>
                </div>
                <div className="text-right text-sm text-white/40">
                  {Math.round(p.confidence * 100)}% confidence
                </div>
              </div>

              {p.metadata?.lexical_evidence && (
                <blockquote className="mt-3 text-sm text-white/70 border-l-2 border-primary/40 pl-3 italic">
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
                    onClick={() => void runAction(p.id, 'confirm')}
                    data-testid={`peripheral-confirm-${p.id}`}
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
                  onClick={() => void runAction(p.id, 'promote')}
                  data-testid={`peripheral-promote-${p.id}`}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  {p.peripheral_person_id ? 'In Character Book' : 'Add to Character Book'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/50 hover:text-red-300"
                  disabled={actionId === p.id}
                  onClick={() => void runAction(p.id, 'dismiss')}
                  data-testid={`peripheral-dismiss-${p.id}`}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Dismiss
                </Button>
              </div>

              {p.tier === 'suspected' && (
                <p className="text-xs text-amber-400/80 mt-3 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Suspected link — not verified as your direct relationship.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
