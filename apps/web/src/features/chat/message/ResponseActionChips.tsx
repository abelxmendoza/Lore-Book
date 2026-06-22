import { useState } from 'react';
import { Check, Loader2, Plus, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { config } from '../../../config/env';
import type { ResponseActionCandidate } from '../../../hooks/useChatStream';

/**
 * Renders the Response Compiler's action chips beneath an assistant message and
 * applies them on click. This is the user-confirmation gate: the assistant only
 * *suggests* ("Create School Band group"); nothing becomes canon until the user
 * clicks here, which POSTs to /api/response-actions/apply.
 */

type ChipState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'done'; label: string }
  | { status: 'noop'; label: string }
  | { status: 'error'; label: string };

type ApplyResponse = {
  applied: boolean;
  status: 'created' | 'already_exists' | 'not_yet_supported' | 'invalid';
  message?: string;
};

function iconFor(type: string) {
  if (type === 'create_group') return Users;
  return Plus;
}

async function applyAction(action: ResponseActionCandidate): Promise<ApplyResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const apiUrl = config.api.url;
  const url = apiUrl ? `${apiUrl}/api/response-actions/apply` : '/api/response-actions/apply';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ type: action.type, label: action.label, payload: action.payload }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Sign in to apply');
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as ApplyResponse;
}

export function ResponseActionChips({ actions }: { actions: ResponseActionCandidate[] }) {
  const [states, setStates] = useState<Record<number, ChipState>>({});

  if (!actions || actions.length === 0) return null;

  const run = async (index: number, action: ResponseActionCandidate) => {
    const current = states[index]?.status;
    if (current === 'pending' || current === 'done') return;

    setStates((s) => ({ ...s, [index]: { status: 'pending' } }));
    try {
      const result = await applyAction(action);
      const next: ChipState =
        result.status === 'created'
          ? { status: 'done', label: result.message ?? 'Done' }
          : result.status === 'already_exists'
            ? { status: 'noop', label: 'Already exists' }
            : { status: 'noop', label: 'Not available yet' };
      setStates((s) => ({ ...s, [index]: next }));
    } catch (err) {
      setStates((s) => ({
        ...s,
        [index]: { status: 'error', label: err instanceof Error ? err.message : 'Failed' },
      }));
    }
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid="response-action-chips">
      {actions.map((action, i) => {
        const state = states[i] ?? { status: 'idle' };
        const Icon = iconFor(action.type);
        const disabled = state.status === 'pending' || state.status === 'done';

        return (
          <button
            key={`${action.type}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => run(i, action)}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
              state.status === 'done'
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : state.status === 'error'
                  ? 'border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20'
                  : state.status === 'noop'
                    ? 'border-white/10 bg-white/[0.03] text-white/40'
                    : 'border-primary/30 bg-primary/10 text-white/80 hover:bg-primary/20 hover:text-white',
              disabled ? 'cursor-default' : 'cursor-pointer',
            ].join(' ')}
            title={action.label}
          >
            {state.status === 'pending' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : state.status === 'done' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            <span>
              {state.status === 'done' || state.status === 'noop' || state.status === 'error'
                ? state.label
                : action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
