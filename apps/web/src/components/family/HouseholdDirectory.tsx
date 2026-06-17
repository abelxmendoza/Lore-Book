import { Home, Users, User } from 'lucide-react';

export type HouseholdMemberDTO = {
  characterId: string;
  name: string;
  householdRole: string;
  kinshipLabel?: string;
  confidence: number;
};

export type HouseholdDTO = {
  id: string;
  name: string;
  locationName?: string;
  headOfHousehold?: string;
  residents: HouseholdMemberDTO[];
  visitors: HouseholdMemberDTO[];
  residentCount: number;
  confidence: number;
};

type Props = {
  households: HouseholdDTO[];
  onMemberClick?: (characterId: string, name: string) => void;
};

function MemberList({
  title,
  members,
  onMemberClick,
}: {
  title: string;
  members: HouseholdMemberDTO[];
  onMemberClick?: (id: string, name: string) => void;
}) {
  if (!members.length) return null;
  return (
    <div>
      <p className="text-xs text-white/45 mb-1.5">{title}</p>
      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.characterId}>
            <button
              type="button"
              onClick={() => onMemberClick?.(m.characterId, m.name)}
              className="flex items-center gap-2 text-sm text-white/80 hover:text-purple-200 transition"
            >
              <User className="h-3.5 w-3.5 text-white/30" />
              <span>{m.name}</span>
              {m.kinshipLabel && <span className="text-xs text-white/35">· {m.kinshipLabel}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HouseholdDirectory({ households, onMemberClick }: Props) {
  if (!households.length) {
    return (
      <div className="text-center py-12 text-white/45 text-sm">
        <Home className="h-10 w-10 mx-auto mb-3 opacity-30" />
        Mention where people live in chat — LoreBook infers households from phrases like &quot;Abuela&apos;s house&quot;.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {households.map((h) => (
        <article
          key={h.id}
          className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-black/40 p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Home className="h-4 w-4 text-amber-400" />
                {h.locationName ?? h.name}
              </h3>
              {h.headOfHousehold && (
                <p className="text-xs text-white/50 mt-1">
                  Head of household: <span className="text-amber-200/90">{h.headOfHousehold}</span>
                </p>
              )}
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
              {Math.round(h.confidence * 100)}%
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MemberList title="Residents" members={h.residents} onMemberClick={onMemberClick} />
            <MemberList title="Visitors" members={h.visitors} onMemberClick={onMemberClick} />
          </div>

          <p className="text-[10px] text-white/30 flex items-center gap-1">
            <Users className="h-3 w-3" />
            {h.residentCount} resident{h.residentCount !== 1 ? 's' : ''}
          </p>
        </article>
      ))}
    </div>
  );
}
