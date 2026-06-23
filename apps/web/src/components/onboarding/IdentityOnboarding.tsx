import { useState } from 'react';
import { fetchJson } from '../../lib/api';
import { Sparkles, Loader2, Check, X } from 'lucide-react';

/**
 * Narrative onboarding: "Tell me about yourself" → AI extraction → confirmation
 * chips → populate the user's Main Character. Works for new AND existing users
 * (the re-prompt opens this). Self-contained; render in a modal/panel.
 */

type Chip = { label: string; confidence: number; evidence?: string };

type IdentityDraft = {
  identity: { preferredName?: string; occupation?: string; lifePhase?: string; summary?: string };
  people: Chip[];
  places: Chip[];
  organizations: Chip[];
  skills: Chip[];
  interests: Chip[];
  goals: Chip[];
  projects: Chip[];
  events: Chip[];
  values: Chip[];
};

const CATEGORIES: Array<{ key: keyof IdentityDraft; label: string; icon: string }> = [
  { key: 'people', label: 'People', icon: '🧑' },
  { key: 'places', label: 'Places', icon: '📍' },
  { key: 'organizations', label: 'Organizations', icon: '🏢' },
  { key: 'skills', label: 'Skills', icon: '⚡' },
  { key: 'projects', label: 'Projects', icon: '🛠️' },
  { key: 'goals', label: 'Goals', icon: '🎯' },
  { key: 'interests', label: 'Interests', icon: '✨' },
  { key: 'events', label: 'Life events', icon: '📅' },
  { key: 'values', label: 'Values', icon: '💛' },
];

const PROMPT = "Tell me about yourself and what's going on in your life right now — your work, the people who matter, what you're working toward.";

type Props = {
  onComplete?: () => void;
  onClose?: () => void;
};

export const IdentityOnboarding = ({ onComplete, onClose }: Props) => {
  const [phase, setPhase] = useState<'narrative' | 'confirm' | 'done'>('narrative');
  const [narrative, setNarrative] = useState('');
  const [draft, setDraft] = useState<IdentityDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (narrative.trim().length < 10) {
      setError('Tell me a little more — a sentence or two about your world.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetchJson<{ draft: IdentityDraft }>('/api/onboarding/narrative', {
        method: 'POST',
        body: JSON.stringify({ narrative: narrative.trim() }),
      });
      setDraft(res.draft);
      setPhase('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze your story. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const removeChip = (key: keyof IdentityDraft, index: number) => {
    if (!draft) return;
    const arr = draft[key];
    if (!Array.isArray(arr)) return;
    setDraft({ ...draft, [key]: arr.filter((_, i) => i !== index) });
  };

  const confirm = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson('/api/onboarding/confirm', {
        method: 'POST',
        body: JSON.stringify({ draft, narrative: narrative.trim() }),
      });
      setPhase('done');
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const totalFound = draft
    ? CATEGORIES.reduce((n, c) => n + (Array.isArray(draft[c.key]) ? (draft[c.key] as Chip[]).length : 0), 0)
    : 0;

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d0d12] p-6 text-white">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Build your LoreBook</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {phase === 'narrative' && (
        <div>
          <p className="mb-3 text-sm text-white/60">{PROMPT}</p>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={7}
            autoFocus
            placeholder="I'm a software engineer in Portland building a startup. My partner Sarah and I just moved here. This year I want to launch and reach my first 1,000 users…"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white placeholder:text-white/30 focus:border-primary/40 focus:outline-none"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={analyze}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'Reading your story…' : 'Build my world'}
            </button>
          </div>
        </div>
      )}

      {phase === 'confirm' && draft && (
        <div>
          {draft.identity.summary && (
            <div className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.06] p-3 text-sm">
              <div className="text-white/80">{draft.identity.summary}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/50">
                {draft.identity.occupation && <span>· {draft.identity.occupation}</span>}
                {draft.identity.lifePhase && <span>· {draft.identity.lifePhase}</span>}
              </div>
            </div>
          )}
          <p className="mb-3 text-sm text-white/60">
            Here's what I found ({totalFound}). Remove anything that's not right, then confirm.
          </p>
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {CATEGORIES.map(({ key, label, icon }) => {
              const chips = draft[key] as Chip[];
              if (!Array.isArray(chips) || chips.length === 0) return null;
              return (
                <div key={key}>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-white/40">
                    {icon} {label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip, i) => (
                      <button
                        key={`${chip.label}-${i}`}
                        type="button"
                        onClick={() => removeChip(key, i)}
                        title={chip.evidence ? `“${chip.evidence}”` : undefined}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/80 hover:border-red-400/30 hover:bg-red-400/10"
                      >
                        <span>{chip.label}</span>
                        <X className="h-3 w-3 text-white/30 group-hover:text-red-300" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {totalFound === 0 && (
              <div className="text-sm text-white/40">
                I couldn't pull out specifics — you can go back and add a bit more detail.
              </div>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" onClick={() => setPhase('narrative')} className="text-sm text-white/50 hover:text-white">
              ← Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm & build my LoreBook
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15">
            <Check className="h-6 w-6 text-emerald-300" />
          </div>
          <h3 className="text-base font-semibold">Your LoreBook is taking shape</h3>
          <p className="mt-1 text-sm text-white/55">
            I've started your Main Character and the people, places, and goals from your story.
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white"
            >
              Explore my LoreBook
            </button>
          )}
        </div>
      )}
    </div>
  );
};
