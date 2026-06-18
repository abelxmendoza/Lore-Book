import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, FileText, MessageSquare, RefreshCw, Shield, Sparkles,
} from 'lucide-react';
import { fetchJson } from '../../lib/api';

export type EvidenceItem = {
  id: string;
  kind: 'moment' | 'file' | 'fact' | 'conversation' | 'claim';
  artifactType: string;
  label: string;
  subtitle?: string;
  createdAt: string;
  truthState?: string;
  route?: string;
};

export type CharacterEvidenceLockerData = {
  characterId: string;
  characterName: string;
  items: EvidenceItem[];
  totalCount: number;
  summary: string;
};

const KIND_ICONS = {
  moment: BookOpen,
  file: FileText,
  fact: Sparkles,
  conversation: MessageSquare,
  claim: Shield,
};

type Props = {
  characterId: string;
  characterName: string;
  mockMode?: boolean;
  active?: boolean;
};

const MOCK_LOCKER: CharacterEvidenceLockerData = {
  characterId: 'mock',
  characterName: 'Maya',
  totalCount: 3,
  summary: '2 moments, 1 file support this record.',
  items: [
    {
      id: 'm1', kind: 'moment', artifactType: 'journal_entry',
      label: 'The conversation with Maya', subtitle: 'Journal entry',
      createdAt: new Date(Date.now() - 11 * 86400000).toISOString(),
      truthState: 'CANONICAL', route: '/what-ai-knows?tab=moment',
    },
    {
      id: 'f1', kind: 'file', artifactType: 'user_file',
      label: 'contacts.csv', subtitle: 'text/csv · derived from import',
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      route: '/what-ai-knows?tab=evidence',
    },
    {
      id: 'fact1', kind: 'fact', artifactType: 'entity_fact',
      label: 'Works at Riverside Cafe', subtitle: 'career',
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
  ],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CharacterEvidenceLocker({
  characterId,
  characterName,
  mockMode,
  active = true,
}: Props) {
  const navigate = useNavigate();
  const [locker, setLocker] = useState<CharacterEvidenceLockerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (mockMode) {
      setLocker({ ...MOCK_LOCKER, characterId, characterName });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchJson<{ success: boolean; locker: CharacterEvidenceLockerData }>(
        `/api/characters/${characterId}/evidence`
      );
      setLocker(res.locker);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evidence');
    } finally {
      setLoading(false);
    }
  }, [characterId, characterName, mockMode]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 py-12 justify-center">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Gathering evidence…</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-rose-400 text-sm py-8 text-center">{error}</p>;
  }

  if (!locker) return null;

  return (
    <div className="space-y-4" data-testid="character-evidence-locker">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-medium text-white">Evidence Locker</h3>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{locker.summary}</p>
        <button
          type="button"
          onClick={() =>
            navigate(`/what-ai-knows?tab=constellation&centerId=${characterId}`)
          }
          className="mt-2 text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2"
        >
          View in constellation
        </button>
      </div>

      {locker.items.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-8">
          Mention {characterName} in chat or upload a document to start building evidence.
        </p>
      ) : (
        <div className="space-y-2">
          {locker.items.map((item) => {
            const Icon = KIND_ICONS[item.kind] ?? Sparkles;
            const clickable = Boolean(item.route);
            const Wrapper = clickable ? 'button' : 'div';
            return (
              <Wrapper
                key={`${item.artifactType}-${item.id}`}
                type={clickable ? 'button' : undefined}
                onClick={clickable ? () => navigate(item.route!) : undefined}
                className={`w-full flex items-start gap-3 px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50 text-left ${
                  clickable ? 'hover:border-zinc-600 transition-colors' : ''
                }`}
              >
                <Icon className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{item.label}</p>
                  {item.subtitle && (
                    <p className="text-xs text-zinc-500 mt-0.5">{item.subtitle}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-600 shrink-0">{formatDate(item.createdAt)}</span>
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
}
