import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, HelpCircle, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchDomainTrust, type TrustDomain } from '../../api/trust';

const DOMAIN_LABELS: Record<TrustDomain, string> = {
  characters: 'Characters',
  locations: 'Locations',
  organizations: 'Groups',
  projects: 'Projects',
  goals: 'Goals',
  skills: 'Skills',
  communities: 'Communities',
  relationships: 'Relationships',
  events: 'Events',
  households: 'Households',
};

type Props = {
  domain: TrustDomain;
  className?: string;
};

/** Phase 6 — compact trust line for Book headers */
export function BookTrustSummary({ domain, className = '' }: Props) {
  const navigate = useNavigate();
  const [line, setLine] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDomainTrust(domain)
      .then((d) => {
        if (cancelled) return;
        const parts = [`${d.entity_count} total`];
        if (d.states?.suggested > 0) parts.push(`${d.states.suggested} suggested`);
        if (d.states?.conflicted > 0) parts.push(`${d.states.conflicted} conflicts`);
        if (d.states?.unverified > 0) parts.push(`${d.states.unverified} unverified`);
        setLine(parts.join(' · '));
        setCoverage(d.coverage_score ?? 0);
      })
      .catch(() => {
        if (!cancelled) setLine(null);
      });
    return () => { cancelled = true; };
  }, [domain]);

  if (!line) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/gaps')}
      className={`group flex flex-wrap items-center gap-2 text-left text-xs text-white/50 hover:text-white/80 transition ${className}`}
      title="View coverage and gaps"
    >
      <Shield className="h-3.5 w-3.5 text-primary/70 shrink-0" />
      <span>{DOMAIN_LABELS[domain]}: {line}</span>
      {coverage !== null && (
        <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-primary/80">
          {coverage}% coverage
        </span>
      )}
      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
    </button>
  );
}
