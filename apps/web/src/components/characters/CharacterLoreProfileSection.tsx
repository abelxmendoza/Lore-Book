/**
 * Skills, hobbies, interests, groups, and people associations — from chat-derived lore only.
 */
import {
  Briefcase,
  Heart,
  Layers,
  Sparkles,
  Users,
  UserX,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { UnknownField } from '../ui/UnknownField';
import type {
  CharacterLoreProfile,
  CharacterLoreItem,
  CharacterPersonAssociation,
} from '../../api/characterLoreProfile';

type Props = {
  profile: CharacterLoreProfile | null;
  loading: boolean;
  characterFirstName: string;
  onAskInChat: (prompt: string) => void;
  onOpenCharacter?: (characterId: string) => void;
};

function LoreChipList({
  items,
  emptyLabel,
  askPrompt,
  onAskInChat,
}: {
  items: CharacterLoreItem[];
  emptyLabel: string;
  askPrompt: string;
  onAskInChat: (prompt: string) => void;
}) {
  if (items.length === 0) {
    return <UnknownField label={emptyLabel} prompt={askPrompt} onAskInChat={onAskInChat} />;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.id}
          className="text-xs px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] text-white/85"
          title={item.evidence ?? item.category}
        >
          {item.label}
          {item.confidence != null && item.confidence >= 0.75 && (
            <span className="ml-1 text-[9px] text-emerald-400/80">●</span>
          )}
        </span>
      ))}
    </div>
  );
}

function associationBadge(kind: CharacterPersonAssociation['associationKind']) {
  switch (kind) {
    case 'direct':
      return { label: 'Know them', className: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' };
    case 'mentioned':
      return { label: 'Mentioned only', className: 'bg-amber-500/15 text-amber-200 border-amber-500/30' };
    case 'peripheral':
      return { label: 'Via someone else', className: 'bg-violet-500/15 text-violet-200 border-violet-500/30' };
    default:
      return { label: 'Story link', className: 'bg-white/10 text-white/60 border-white/15' };
  }
}

export function CharacterLoreProfileSection({
  profile,
  loading,
  characterFirstName,
  onAskInChat,
  onOpenCharacter,
}: Props) {
  if (loading) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/40">
        Loading skills, interests, and connections…
      </section>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-4">
      {profile.mentionOnly && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2 text-xs text-amber-100/90">
          <UserX className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            LoreBook only knows {characterFirstName} from what you&apos;ve said — you may not know them personally.
            Details below come from your mentions, not assumptions.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <section className="rounded-xl border border-indigo-500/20 bg-indigo-950/15 p-3.5">
          <h3 className="text-xs font-bold text-indigo-200/90 flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Skills
          </h3>
          <LoreChipList
            items={profile.skills}
            emptyLabel="Skills"
            askPrompt={`What skills does ${characterFirstName} have? `}
            onAskInChat={onAskInChat}
          />
        </section>

        <section className="rounded-xl border border-pink-500/20 bg-pink-950/15 p-3.5">
          <h3 className="text-xs font-bold text-pink-200/90 flex items-center gap-1.5 mb-2">
            <Heart className="h-3.5 w-3.5" /> Hobbies & interests
          </h3>
          <LoreChipList
            items={[...profile.hobbies, ...profile.interests]}
            emptyLabel="Hobbies & interests"
            askPrompt={`What are ${characterFirstName}'s hobbies and interests? `}
            onAskInChat={onAskInChat}
          />
        </section>
      </div>

      <section className="rounded-xl border border-teal-500/20 bg-teal-950/15 p-3.5">
        <h3 className="text-xs font-bold text-teal-200/90 flex items-center gap-1.5 mb-2">
          <Briefcase className="h-3.5 w-3.5" /> Groups & affiliations
        </h3>
        {profile.groups.length === 0 ? (
          <UnknownField
            label="Groups"
            prompt={`What teams, companies, or groups is ${characterFirstName} part of? `}
            onAskInChat={onAskInChat}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.groups.map((g) => (
              <Badge
                key={g.organizationId}
                variant="outline"
                className="text-[11px] bg-teal-500/10 text-teal-100 border-teal-500/25"
              >
                {g.name}
                {g.role ? ` · ${g.role.replace(/_/g, ' ')}` : ''}
                {g.type ? ` (${g.type.replace(/_/g, ' ')})` : ''}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> People in their world
        </h3>
        {profile.people.length === 0 ? (
          <UnknownField
            label="Connections"
            prompt={`Who is ${characterFirstName} connected to in your story? `}
            onAskInChat={onAskInChat}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {profile.people.slice(0, 8).map((person) => {
              const badge = associationBadge(person.associationKind);
              const clickable = person.characterId && onOpenCharacter;
              return (
                <button
                  key={`${person.characterId ?? person.name}-${person.relationshipType}`}
                  type="button"
                  disabled={!clickable}
                  onClick={() => person.characterId && onOpenCharacter?.(person.characterId)}
                  className={`rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors ${
                    clickable ? 'hover:border-primary/30 hover:bg-primary/5 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-white truncate">{person.name}</span>
                    <Badge variant="outline" className={`text-[9px] shrink-0 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-white/45 capitalize truncate">
                    {person.relationshipType.replace(/_/g, ' ')}
                    {person.domain ? ` · ${person.domain}` : ''}
                  </p>
                  {person.summary && (
                    <p className="text-[10px] text-white/35 mt-1 line-clamp-2">{person.summary}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {profile.loreSnippets.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
          <h3 className="text-xs font-bold text-white/70 flex items-center gap-1.5 mb-2">
            <Layers className="h-3.5 w-3.5" /> Other lore
          </h3>
          <ul className="space-y-1.5 text-xs text-white/65">
            {profile.loreSnippets.slice(0, 6).map((snippet) => (
              <li key={snippet.id} className="flex gap-2">
                <span className="text-white/25 shrink-0 capitalize">{snippet.category?.replace(/_/g, ' ')}</span>
                <span>{snippet.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
