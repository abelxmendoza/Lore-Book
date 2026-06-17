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
  confirmPeripheral,
  dismissPeripheral,
  listPeripherals,
  promotePeripheral,
  type RomanticPeripheral,
} from '../../api/romanticPeripherals';
import { getMockPeripheralsForRelationship } from '../../mocks/romanticPeripherals';

type TheirConnectionsPanelProps = {
  relationshipId: string;
  anchorName: string;
  onUpdate?: () => void;
};

const ROLE_LABELS: Record<string, string> = {
  side_partner: 'Side partner',
  current_partner: 'Other partner',
  ex: 'Ex',
  crush: 'Crush',
  hookup: 'Hookup',
  rival: 'Rival',
  unknown: 'Unknown',
};

const PROXIMITY_LABELS: Record<string, string> = {
  direct: 'You met them',
  indirect: 'Indirect connection',
  distant: 'Distant',
  unmet: 'Never met',
  third_party: 'Hearsay only',
};

function tierBadge(tier: RomanticPeripheral['tier']) {
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

export function TheirConnectionsPanel({
  relationshipId,
  anchorName,
  onUpdate,
}: TheirConnectionsPanelProps) {
  const { useMockData: useMocks } = useMockData();
  const [peripherals, setPeripherals] = useState<RomanticPeripheral[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'suspected' | 'confirmed'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (useMocks) {
        setPeripherals(getMockPeripheralsForRelationship(relationshipId));
      } else {
        const rows = await listPeripherals(relationshipId);
        setPeripherals(rows);
      }
    } catch (err) {
      console.error('Failed to load periphery', err);
      setPeripherals([]);
    } finally {
      setLoading(false);
    }
  }, [relationshipId, useMocks]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
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
      onUpdate?.();
      return;
    }

    setActionId(id);
    try {
      if (action === 'confirm') await confirmPeripheral(relationshipId, id);
      else if (action === 'dismiss') await dismissPeripheral(relationshipId, id);
      else await promotePeripheral(relationshipId, id);
      await load();
      onUpdate?.();
    } catch (err) {
      console.error(`Peripheral ${action} failed`, err);
    } finally {
      setActionId(null);
    }
  };

  const filtered = peripherals.filter((p) => {
    if (filter === 'all') return true;
    return p.tier === filter;
  });

  if (loading) {
    return (
      <div className="text-center text-white/60 py-12" data-testid="their-connections-loading">
        <GitBranch className="w-10 h-10 mx-auto mb-3 text-pink-400/50 animate-pulse" />
        <p>Scanning for other connections…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="their-connections-panel">
      <div className="rounded-xl border border-pink-500/20 bg-black/30 p-4">
        <div className="flex items-start gap-3">
          <GitBranch className="w-5 h-5 text-pink-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-white font-medium">Their connections</h3>
            <p className="text-sm text-white/60 mt-1">
              Other partners or romantic links attributed to {anchorName} — from chat hearsay,
              overlap signals, or possessive mentions. Confirm, dismiss, or add to Character Book.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'suspected', 'confirmed'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            className={filter === f ? 'bg-pink-600 hover:bg-pink-700' : 'border-white/20'}
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
          data-testid="their-connections-empty"
        >
          <EyeOff className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No other romantic connections detected for {anchorName} yet.</p>
          <p className="text-xs mt-2">Mention overlap or hearsay in chat to surface suspects.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-white/10 bg-gradient-to-br from-purple-950/40 to-black/40 p-4"
              data-testid={`peripheral-card-${p.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg text-white font-medium">
                      {p.peripheral_name ?? p.peripheral_surface}
                    </span>
                    {tierBadge(p.tier)}
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
                <blockquote className="mt-3 text-sm text-white/70 border-l-2 border-pink-500/40 pl-3 italic">
                  {p.metadata.lexical_evidence}
                </blockquote>
              )}

              {p.metadata?.glossary_cues && p.metadata.glossary_cues.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.metadata.glossary_cues.map((cue) => (
                    <Badge key={cue} variant="secondary" className="text-xs bg-white/5">
                      {cue}
                    </Badge>
                  ))}
                </div>
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
