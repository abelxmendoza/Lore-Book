import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { profileClaimsApi, type ProfileClaim } from '../../api/profileClaims';
import { dispatchStoryDataUpdated } from '../../lib/storyRefresh';

type ClaimsInboxProps = {
  source?: string;
  limit?: number;
  onUpdated?: () => void;
};

export function ClaimsInbox({ source = 'resume', limit = 8, onUpdated }: ClaimsInboxProps) {
  const [claims, setClaims] = useState<ProfileClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await profileClaimsApi.list({ source, verified_status: 'unverified' });
      setClaims(res.claims.filter((c) => !c.user_confirmed).slice(0, limit));
    } catch {
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [source, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (claimId: string, action: 'confirm' | 'reject') => {
    setActing(claimId);
    try {
      if (action === 'confirm') await profileClaimsApi.confirm(claimId);
      else await profileClaimsApi.reject(claimId);
      dispatchStoryDataUpdated({ scopes: ['all'] });
      await load();
      onUpdated?.();
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/50 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading claims…
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <p className="text-sm text-white/45 py-2">All resume claims reviewed — nothing pending.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {claims.map((claim) => (
        <li
          key={claim.id}
          className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white">{claim.claim_text}</p>
            <p className="text-[10px] uppercase tracking-wide text-white/35 mt-0.5">
              {claim.claim_type} · {Math.round(claim.confidence * 100)}% confidence
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={acting === claim.id}
              onClick={() => void act(claim.id, 'confirm')}
              className="rounded-md bg-emerald-500/20 p-1.5 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
              title="Confirm"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={acting === claim.id}
              onClick={() => void act(claim.id, 'reject')}
              className="rounded-md bg-red-500/15 p-1.5 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
              title="Reject"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
