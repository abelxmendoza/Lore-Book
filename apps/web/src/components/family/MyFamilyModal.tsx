import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Loader2 } from 'lucide-react';

import { Modal } from '../ui/modal';
import { fetchJson } from '../../lib/api';

interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  relation_label?: string;
  generation: number;
  kinship_title?: string;
  is_self?: boolean;
  is_placeholder?: boolean;
}
interface Collision {
  id: string;
  name: string;
  summary?: string | null;
  importance_level?: string | null;
}

type Props = { isOpen: boolean; onClose: () => void };

const GENERATION_LABEL: Record<number, string> = {
  [-2]: 'Grandparents', [-1]: 'Parents · Aunts & Uncles', 0: 'Your generation', 1: 'Children',
};

/**
 * My Family — the user's own card + their family tree, plus same-name
 * disambiguation: a character that shares your name might be YOU or a different
 * person with the same name (e.g. an estranged parent). You confirm which.
 */
export function MyFamilyModal({ isOpen, onClose }: Props) {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [collisions, setCollisions] = useState<Collision[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [fam, coll] = await Promise.all([
        fetchJson<{ tree?: { members?: FamilyMember[] } }>('/api/family').catch(() => ({ tree: { members: [] } })),
        fetchJson<{ collisions: Collision[] }>('/api/characters/self/name-collisions').catch(() => ({ collisions: [] })),
      ]);
      setMembers(fam.tree?.members ?? []);
      setCollisions(coll.collisions ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (isOpen) void load(); }, [isOpen]);

  const confirmIsMe = async (c: Collision) => {
    setBusyId(c.id); setNotice(null);
    try {
      await fetchJson(`/api/characters/${c.id}/merge-into-self`, { method: 'POST' });
      setCollisions((prev) => prev.filter((x) => x.id !== c.id));
      setNotice(`Merged "${c.name}" into your profile.`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not merge');
    } finally { setBusyId(null); }
  };

  const confirmDifferent = async (c: Collision, relationship?: string) => {
    setBusyId(c.id); setNotice(null);
    try {
      await fetchJson(`/api/characters/${c.id}/distinct-from-self`, {
        method: 'POST',
        body: JSON.stringify(relationship ? { relationship } : {}),
      });
      setCollisions((prev) => prev.filter((x) => x.id !== c.id));
      setNotice(`Kept "${c.name}" as a separate person${relationship ? ` (${relationship})` : ''}.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not update');
    } finally { setBusyId(null); }
  };

  const self = members.find((m) => m.is_self);
  const byGen = [-2, -1, 0, 1].map((g) => ({ g, list: members.filter((m) => !m.is_self && !m.is_placeholder && m.generation === g) }))
    .filter((x) => x.list.length > 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="2xl" title="My Family">
      {loading ? (
        <div className="py-10 text-center text-white/40"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading…</div>
      ) : (
        <div className="space-y-6">
          {notice && <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm text-primary">{notice}</div>}

          {/* Self card */}
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary"><Users className="h-6 w-6" /></div>
            <div>
              <div className="text-white font-semibold">{self?.name ?? 'You'}</div>
              <div className="text-xs text-white/45">This is you — the center of your family graph.</div>
            </div>
          </div>

          {/* Same-name confirmation — the estranged-parent case */}
          {collisions.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <div className="text-sm font-medium text-amber-300 mb-1">Someone shares your name</div>
              <p className="text-xs text-white/55 mb-3">
                These characters have the same name as you. Confirm whether each is <strong>you</strong> (merge into your profile)
                or a <strong>different person</strong> who happens to share your name (kept separate).
              </p>
              <div className="space-y-2">
                {collisions.map((c) => (
                  <div key={c.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="text-white text-sm font-medium">{c.name}</div>
                    {c.summary && <div className="text-xs text-white/45 mt-0.5 line-clamp-2">{c.summary}</div>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button type="button" disabled={busyId === c.id} onClick={() => confirmIsMe(c)}
                        className="flex items-center gap-1.5 rounded-lg bg-primary/20 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/30 disabled:opacity-50">
                        <UserCheck className="h-3.5 w-3.5" /> This is me
                      </button>
                      <button type="button" disabled={busyId === c.id} onClick={() => confirmDifferent(c)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/15 text-white/70 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50">
                        <UserX className="h-3.5 w-3.5" /> Different person
                      </button>
                      <button type="button" disabled={busyId === c.id} onClick={() => confirmDifferent(c, 'father')}
                        className="rounded-lg border border-white/15 text-white/60 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50">
                        Different — my father
                      </button>
                      <button type="button" disabled={busyId === c.id} onClick={() => confirmDifferent(c, 'mother')}
                        className="rounded-lg border border-white/15 text-white/60 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50">
                        Different — my mother
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Family by generation */}
          {byGen.length === 0 ? (
            <div className="text-sm text-white/40">No family members inferred yet. They’ll appear as you mention them in chat.</div>
          ) : (
            byGen.map(({ g, list }) => (
              <div key={g}>
                <div className="text-xs uppercase tracking-wide text-white/40 mb-2">{GENERATION_LABEL[g] ?? `Generation ${g}`}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {list.map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      <div className="text-white text-sm font-medium truncate">{m.kinship_title || m.name}</div>
                      <div className="text-[11px] text-white/45">{m.relation_label || m.relation}{m.kinship_title && m.kinship_title !== m.name ? ` · ${m.name}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

export default MyFamilyModal;
