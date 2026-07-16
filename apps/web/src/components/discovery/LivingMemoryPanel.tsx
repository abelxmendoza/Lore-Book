/**
 * Living Memory — LoreBook’s control surface for recall / write / ambient pause.
 * Maps ChatGPT Memories + Chronicle ideas onto life-graph governance.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ClipboardCheck,
  Link2,
  PauseCircle,
  Shield,
  Sparkles,
} from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';

type LivingMemoryPreferences = {
  useLivingMemory: boolean;
  writeLivingMemory: boolean;
  ambientCapturePaused: boolean;
  externalContextWrites: boolean;
};

const DEFAULTS: LivingMemoryPreferences = {
  useLivingMemory: true,
  writeLivingMemory: true,
  ambientCapturePaused: false,
  externalContextWrites: true,
};

type ToggleRowProps = {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
};

function ToggleRow({ id, title, description, checked, disabled, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="text-sm font-medium text-white">
          {title}
        </label>
        <p className="text-xs leading-relaxed text-white/55">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}

export function LivingMemoryPanel() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<LivingMemoryPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ preferences: LivingMemoryPreferences }>(
        '/api/user/living-memory',
      );
      setPrefs({ ...DEFAULTS, ...data.preferences });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Living Memory settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (partial: Partial<LivingMemoryPreferences>) => {
    const previous = prefs;
    const next = { ...prefs, ...partial };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const data = await fetchJson<{ preferences: LivingMemoryPreferences }>(
        '/api/user/living-memory',
        { method: 'PUT', body: JSON.stringify(partial) },
      );
      setPrefs({ ...DEFAULTS, ...data.preferences });
    } catch (err) {
      setPrefs(previous);
      setError(err instanceof Error ? err.message : 'Could not save Living Memory settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-white">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-amber-300/90">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.14em]">Living Memory</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">How LoreBook remembers you</h2>
        <p className="text-sm leading-relaxed text-white/60">
          LoreBook is your life graph — not a chat summary bolt-on. These controls decide whether
          past evidence can shape answers, whether new moments may become durable memory, and
          whether ambient Life Chronicle sources (like X) may write in.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="space-y-3" aria-busy={loading || saving}>
        <ToggleRow
          id="use-living-memory"
          title="Use Living Memory in chat"
          description="When on, Working Memory can pull provenanced people, places, and moments into answers. When off, chat stays in the moment."
          checked={prefs.useLivingMemory}
          disabled={loading || saving}
          onCheckedChange={(useLivingMemory) => void patch({ useLivingMemory })}
        />
        <ToggleRow
          id="write-living-memory"
          title="Write new Living Memory"
          description="When on, shared experiences can propose durable entries for Memory Review. When off, LoreBook still talks with you — it just won’t file new life claims."
          checked={prefs.writeLivingMemory}
          disabled={loading || saving}
          onCheckedChange={(writeLivingMemory) => void patch({ writeLivingMemory })}
        />
        <ToggleRow
          id="pause-ambient"
          title="Pause Life Chronicle (ambient)"
          description="Stops ambient intake from connected life sources (for example X sync → lore) until you resume. Chat you type is unchanged."
          checked={prefs.ambientCapturePaused}
          disabled={loading || saving}
          onCheckedChange={(ambientCapturePaused) => void patch({ ambientCapturePaused })}
        />
        <ToggleRow
          id="external-writes"
          title="Allow external-source writes"
          description="When off, integrations cannot propose durable lore even if ambient capture is running. Prefer this for sensitive seasons."
          checked={prefs.externalContextWrites}
          disabled={loading || saving}
          onCheckedChange={(externalContextWrites) => void patch({ externalContextWrites })}
        />
      </section>

      {prefs.ambientCapturePaused && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Life Chronicle ambient capture is paused. Resume anytime — or leave it off during
            meetings and private browsing seasons.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-white/80">Govern what already exists</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="justify-start gap-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10"
            onClick={() => navigate('/discovery/memory-review')}
          >
            <ClipboardCheck className="h-4 w-4 text-amber-300" />
            Memory Review Queue
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10"
            onClick={() => navigate('/discovery/continuity')}
          >
            <BookOpen className="h-4 w-4 text-teal-300" />
            Continuity Intelligence
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10"
            onClick={() => navigate('/discovery/correction-dashboard')}
          >
            <Shield className="h-4 w-4 text-rose-300" />
            Corrections & pruning
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('navigate-surface', {
                  detail: { surface: 'home' },
                }),
              );
            }}
          >
            <Link2 className="h-4 w-4 text-sky-300" />
            X intake modes
          </Button>
        </div>
        <p className="text-xs text-white/45">
          Per-source intake (Link only / Balanced / Ask me first) still lives on each integration.
          Living Memory is the master stance across your life graph.
        </p>
      </section>
    </div>
  );
}

export default LivingMemoryPanel;
