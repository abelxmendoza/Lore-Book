import {
  BADGE_TONE_CLASS,
  extractLexicalSignals,
  lexicalBadgesFromRelationship,
  lexicalBadgesFromSignals,
  type LexicalBadge,
} from '../../lib/lexicalRelationshipLabels';

interface LexicalSignalBadgesProps {
  metadata?: Record<string, unknown> | null;
  relationship?: {
    status?: string;
    is_situationship?: boolean;
    relationship_type?: string;
    metadata?: Record<string, unknown> | null;
  };
  max?: number;
  className?: string;
}

function Badge({ badge }: { badge: LexicalBadge }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${BADGE_TONE_CLASS[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

export function LexicalSignalBadges({
  metadata,
  relationship,
  max = 6,
  className = '',
}: LexicalSignalBadgesProps) {
  const badges = relationship
    ? lexicalBadgesFromRelationship(relationship)
    : lexicalBadgesFromSignals(extractLexicalSignals(metadata));

  if (badges.length === 0) return null;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {badges.slice(0, max).map((b) => (
        <Badge key={b.key} badge={b} />
      ))}
    </span>
  );
}
