import { Baby, PawPrint, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ConnectionSectionHeader } from './ConnectionSectionHeader';
import {
  groupKinshipConnections,
  type KinshipGroupKey,
} from '../../lib/characterKinshipGroups';
import type { DedupeableRelationship } from '../../lib/dedupeCharacterRelationships';

const GROUP_ICON: Record<KinshipGroupKey, LucideIcon> = {
  parents: Users,
  step_parents: Users,
  adopted_parents: Users,
  children: Baby,
  step_children: Baby,
  adopted_children: Baby,
  pets: PawPrint,
};

type Props<T extends DedupeableRelationship> = {
  relationships: T[];
  onOpen: (relationship: T) => void;
};

/**
 * Parents (biological / step / adoptive), children (biological / step /
 * adopted) and pets as labelled lists. The family tree above shows the same
 * people as a graph; these lists are the "who exactly is in each role" read
 * that a tree makes you trace edges for.
 */
export function CharacterKinshipLists<T extends DedupeableRelationship>({
  relationships,
  onOpen,
}: Props<T>) {
  const groups = groupKinshipConnections(relationships);
  if (groups.length === 0) return null;

  const total = groups.reduce((sum, group) => sum + group.members.length, 0);

  return (
    <div className="pt-8 border-t border-white/[0.06]" data-testid="character-kinship-lists">
      <ConnectionSectionHeader
        icon={Users}
        title="Parents, children & pets"
        meta={`${total} linked`}
      />
      <div className="space-y-4">
        {groups.map((group) => {
          const Icon = GROUP_ICON[group.key];
          return (
            <div key={group.key} data-testid={`kinship-group-${group.key}`}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/30">
                <Icon className="h-3 w-3" aria-hidden="true" />
                {group.label} ({group.members.length})
              </p>
              <ul className="space-y-2">
                {group.members.map((relationship) => (
                  <li key={relationship.character_id ?? relationship.id ?? relationship.character_name}>
                    <button
                      type="button"
                      onClick={() => onOpen(relationship)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-black/40 px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-black/60"
                      data-testid="kinship-row"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-white">
                        {relationship.character_name ?? 'Unknown'}
                      </span>
                      <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary/70">
                        {relationship.relationship_type.replace(/_/g, ' ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
