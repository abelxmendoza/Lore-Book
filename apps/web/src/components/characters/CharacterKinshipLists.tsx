import { Baby, PawPrint, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ConnectionSectionHeader } from './ConnectionSectionHeader';
import {
  groupKinshipConnections,
  KINSHIP_SECTIONS,
  type KinshipGroupKey,
  type KinshipSectionKey,
} from '../../lib/characterKinshipGroups';
import type { DedupeableRelationship } from '../../lib/dedupeCharacterRelationships';

const SECTION_ICON: Record<KinshipSectionKey, LucideIcon> = {
  parents: Users,
  kids_and_pets: Baby,
};

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
 * Two lists — parents, then kids and pets — with step/adoptive kept as
 * sub-labels inside them. The family tree elsewhere shows the same people as a
 * graph; these are the "who exactly is in each role" read a tree makes you
 * trace edges for. Both render even when empty so the roles are always a
 * visible, fillable slot rather than something that silently isn't there.
 */
export function CharacterKinshipLists<T extends DedupeableRelationship>({
  relationships,
  onOpen,
}: Props<T>) {
  const groups = groupKinshipConnections(relationships);
  const byKey = new Map(groups.map((group) => [group.key, group]));

  return (
    <div className="pt-8 border-t border-white/[0.06] space-y-6" data-testid="character-kinship-lists">
      {KINSHIP_SECTIONS.map((section) => {
        const sectionGroups = section.groups
          .map((key) => byKey.get(key))
          .filter((group): group is NonNullable<typeof group> => Boolean(group));
        const total = sectionGroups.reduce((sum, group) => sum + group.members.length, 0);
        const SectionIcon = SECTION_ICON[section.key];

        return (
          <div key={section.key} data-testid={`kinship-section-${section.key}`}>
            <ConnectionSectionHeader
              icon={SectionIcon}
              title={section.title}
              meta={total > 0 ? `${total} linked` : undefined}
            />
            {total === 0 ? (
              <p className="text-xs text-white/35">{section.emptyLabel}</p>
            ) : (
              <div className="space-y-4">
                {sectionGroups.map((group) => {
                  const GroupIcon = GROUP_ICON[group.key];
                  return (
                    <div key={group.key} data-testid={`kinship-group-${group.key}`}>
                      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/30">
                        <GroupIcon className="h-3 w-3" aria-hidden="true" />
                        {group.label} ({group.members.length})
                      </p>
                      <ul className="space-y-2">
                        {group.members.map((relationship) => (
                          <li
                            key={relationship.character_id ?? relationship.id ?? relationship.character_name}
                          >
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
            )}
          </div>
        );
      })}
    </div>
  );
}
