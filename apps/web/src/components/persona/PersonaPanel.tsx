import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '../ui/button';

export type PersonaSnapshot = {
  version: string;
  motifs: string[];
  toneProfile: Record<string, string>;
  behavioralBiases: Record<string, unknown>;
  emotionalVector: Record<string, unknown>;
  description: string;
  lastUpdated: string;
};

export type PersonaPanelProps = {
  persona: PersonaSnapshot | null;
  history?: PersonaSnapshot[];
  onRefresh?: () => void;
};

export const PersonaPanel = ({ persona, history, onRefresh }: PersonaPanelProps) => {
  const latest = persona;
  const versionHistory = useMemo(() => history ?? [], [history]);

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-black/60 p-6 text-white shadow-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-primary" />
          <div>
            <p className="text-xs uppercase tracking-widest text-white/50">Omega Persona Engine</p>
            <h2 className="text-2xl font-semibold">Persona</h2>
          </div>
        </div>
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh}>
            Refresh
          </Button>
        )}
      </div>

      {latest ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
            <p className="text-xs uppercase tracking-widest text-primary/80">Current Version</p>
            <p className="text-lg font-semibold">{latest.version}</p>
            <p className="mt-2 text-sm text-white/70">{latest.description}</p>
            <p className="mt-1 text-xs text-white/50">Updated {new Date(latest.lastUpdated).toLocaleString()}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-white/50">Motifs</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(latest.motifs || []).map((motif) => (
                  <span key={motif} className="rounded-full bg-primary/20 px-3 py-1 text-xs text-primary-foreground">
                    {motif}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-widest text-white/50">Tone Profile</p>
              <ul className="mt-2 space-y-1 text-sm text-white/70">
                {Object.entries(latest.toneProfile || {}).map(([key, value]) => (
                  <li key={key}>
                    <span className="text-white/60">{key}:</span> {String(value)}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-white/50">Behavioral Signals</p>
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {Object.entries(latest.behavioralBiases || {}).map(([key, value]) => (
                <li key={key} className="rounded-lg border border-border/40 bg-black/40 p-3 text-sm text-white/80">
                  <span className="text-white/60">{key}:</span> {String(value)}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-border/60 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-widest text-white/50">Evolution</p>
            <div className="space-y-2 text-sm text-white/70">
              {versionHistory.length === 0 && <p>No persona history yet.</p>}
              {versionHistory.slice(-5).map((snapshot, idx) => (
                <div key={`${snapshot.version}-${idx}`} className="rounded-lg border border-border/30 bg-black/40 p-3">
                  <p className="font-semibold">{snapshot.version}</p>
                  <p className="text-xs text-white/50">{new Date(snapshot.lastUpdated).toLocaleString()}</p>
                  <p className="text-sm text-white/70">{snapshot.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white/60">No persona loaded yet.</p>
      )}
    </div>
  );
};
