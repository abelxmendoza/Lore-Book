import { GitBranch, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

type PeripheryAnalytics = {
  total: number;
  suspected: number;
  confirmed: number;
  dismissed?: number;
  confirmRate: number;
  byDomain: Record<string, number>;
  crossAnchorSurfaces?: Array<{ surface: string; anchorCount: number; domains: string[] }>;
  topAnchors?: Array<{ anchorPersonId: string; anchorName: string; count: number }>;
  recent?: Array<{
    id: string;
    peripheral_surface: string;
    anchor_name?: string;
    domain: string;
    tier: string;
    role: string;
  }>;
};

const DOMAIN_LABELS: Record<string, string> = {
  romantic: 'Romantic',
  family: 'Family',
  social: 'Social',
  professional: 'Work',
  mentor: 'Mentor',
  adversarial: 'Conflict',
  creative: 'Creative',
};

type Props = {
  data: PeripheryAnalytics;
};

export function RelationshipPeripheryIntelligenceCard({ data }: Props) {
  const domainEntries = Object.entries(data.byDomain).sort((a, b) => b[1] - a[1]);
  const activeTotal = data.suspected + data.confirmed;

  return (
    <Card className="bg-gradient-to-br from-indigo-950/40 to-purple-950/30 border-indigo-500/30" data-testid="periphery-intelligence-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <GitBranch className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <CardTitle className="text-lg text-white">Vicarious Network Intelligence</CardTitle>
            <CardDescription className="text-white/60">
              People connected to your characters through hearsay — their roommates, relatives, coworkers, and more
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-center">
            <div className="text-2xl font-semibold text-white">{activeTotal}</div>
            <div className="text-xs text-white/50 mt-1">Active links</div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
            <div className="text-2xl font-semibold text-amber-200">{data.suspected}</div>
            <div className="text-xs text-white/50 mt-1">Suspected</div>
          </div>
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
            <div className="text-2xl font-semibold text-green-200">{data.confirmed}</div>
            <div className="text-xs text-white/50 mt-1">Confirmed</div>
          </div>
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 text-center">
            <div className="text-2xl font-semibold text-indigo-200">
              {Math.round(data.confirmRate * 100)}%
            </div>
            <div className="text-xs text-white/50 mt-1">Confirm rate</div>
          </div>
        </div>

        {domainEntries.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white/80 mb-2">By domain</h4>
            <div className="flex flex-wrap gap-2">
              {domainEntries.map(([domain, count]) => (
                <Badge
                  key={domain}
                  variant="outline"
                  className="border-indigo-400/30 bg-indigo-500/10 text-indigo-100"
                >
                  {DOMAIN_LABELS[domain] ?? domain}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {data.topAnchors && data.topAnchors.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-300" />
              Richest anchor characters
            </h4>
            <ul className="space-y-2">
              {data.topAnchors.slice(0, 5).map((a) => (
                <li
                  key={a.anchorPersonId}
                  className="flex items-center justify-between text-sm rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="text-white/90">{a.anchorName}</span>
                  <span className="text-white/50">{a.count} link{a.count !== 1 ? 's' : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.crossAnchorSurfaces && data.crossAnchorSurfaces.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white/80 mb-2">Cross-anchor surfaces</h4>
            <p className="text-xs text-white/45 mb-2">
              Names appearing through multiple people — possible shared connections or duplicates.
            </p>
            <ul className="space-y-2">
              {data.crossAnchorSurfaces.slice(0, 3).map((c) => (
                <li
                  key={c.surface}
                  className="text-sm rounded-lg border border-purple-500/20 bg-purple-950/20 px-3 py-2 text-white/80"
                >
                  <span className="font-medium capitalize">{c.surface}</span>
                  <span className="text-white/50"> — via {c.anchorCount} anchors</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.recent && data.recent.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white/80 mb-2">Recent detections</h4>
            <ul className="space-y-2">
              {data.recent.slice(0, 4).map((r) => (
                <li
                  key={r.id}
                  className="text-sm rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="text-white">{r.peripheral_surface}</span>
                  <span className="text-white/50">
                    {' '}
                    via {r.anchor_name ?? 'unknown'} · {DOMAIN_LABELS[r.domain] ?? r.domain}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
