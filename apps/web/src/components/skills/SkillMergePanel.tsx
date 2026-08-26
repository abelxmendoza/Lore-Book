import { useMemo, useState } from 'react';
import { GitMerge, Search } from 'lucide-react';
import type { Skill } from '../../types/skill';
import { isPrimarySkillBookRecord } from '../../lib/skillOntology';
import { skillAliasesFromMetadata } from '../../lib/skillAliases';
import { findRelatedBookSkills } from '../../lib/skillRelated';

type Props = {
  skill: Skill;
  peers: Skill[];
  busy?: boolean;
  error?: string | null;
  onMerge: (sourceId: string, targetId: string) => void;
};

export function SkillMergePanel({ skill, peers, busy = false, error, onMerge }: Props) {
  const [query, setQuery] = useState('');
  const aliases = skillAliasesFromMetadata(skill.metadata);
  const related = useMemo(() => findRelatedBookSkills(skill, peers), [skill, peers]);
  const searchHits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return peers
      .filter((peer) => peer.id !== skill.id && isPrimarySkillBookRecord(peer))
      .filter((peer) => {
        const haystack = [
          peer.skill_name,
          ...skillAliasesFromMetadata(peer.metadata),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 6);
  }, [peers, query, skill.id]);

  const rows = query.trim().length >= 2 ? searchHits : related;

  return (
    <section className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-white/45 flex items-center gap-1">
        <GitMerge className="h-3 w-3" />
        Merge or correct
      </p>
      {aliases.length > 0 && (
        <p className="text-[11px] text-white/50">Also known as {aliases.join(', ')}</p>
      )}
      <p className="text-[11px] text-white/45">
        Fold a related card into this name, or keep another name and fold this one into it.
      </p>
      <label className="block">
        <span className="sr-only">Search skills to merge</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills to merge…"
            className="h-9 w-full rounded-md border border-white/15 bg-black/40 pl-8 pr-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
          />
        </span>
      </label>
      {rows.length === 0 ? (
        <p className="text-[11px] text-white/40">
          {query.trim().length >= 2
            ? 'No matching Skills book entries.'
            : 'No automatic cousins right now. Search to merge with any skill.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((peer) => (
            <li
              key={peer.id}
              className="rounded-md border border-white/10 bg-black/30 px-3 py-2 space-y-1.5"
            >
              <p className="text-sm text-white truncate">{peer.skill_name}</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMerge(peer.id, skill.id)}
                  className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                >
                  Merge into {skill.skill_name}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMerge(skill.id, peer.id)}
                  className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/5 disabled:opacity-50"
                >
                  Keep {peer.skill_name}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-[11px] text-red-200" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
