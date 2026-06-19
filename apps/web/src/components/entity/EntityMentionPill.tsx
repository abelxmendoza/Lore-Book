import type { EntityMentionRef } from '../../lib/entityMentions';
import { pillClassForEntity, visualKindForEntity, ENTITY_VISUAL_LABELS } from '../../lib/entityTypeColors';

type EntityMentionPillProps = {
  entity: EntityMentionRef;
  label?: string;
  className?: string;
  'data-testid'?: string;
};

/**
 * Inline pill badge for entity names mentioned in prose (chat bubbles, summaries, etc.).
 */
export function EntityMentionPill({
  entity,
  label,
  className = '',
  'data-testid': testId,
}: EntityMentionPillProps) {
  const visual = visualKindForEntity(entity);
  const text = label ?? entity.name;

  return (
    <span
      data-testid={testId ?? `entity-mention-pill-${visual}-${entity.id}`}
      title={`${entity.name} (${ENTITY_VISUAL_LABELS[visual]})`}
      className={`${pillClassForEntity(entity)} ${className}`.trim()}
    >
      {text}
    </span>
  );
}
