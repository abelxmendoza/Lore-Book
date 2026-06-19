import type { ReactNode } from 'react';
import type { EntityMentionRef } from '../../lib/entityMentions';
import { splitTextWithEntityMentions } from '../../lib/entityMentions';
import { EntityMentionPill } from './EntityMentionPill';

type TextWithEntityPillsProps = {
  text: string;
  entities?: EntityMentionRef[];
  className?: string;
};

export function TextWithEntityPills({ text, entities = [], className }: TextWithEntityPillsProps) {
  const segments = splitTextWithEntityMentions(text, entities);

  if (segments.length === 1 && segments[0].kind === 'text') {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const nodes: ReactNode[] = segments.map((segment, index) => {
    if (segment.kind === 'text') {
      return <span key={`t-${index}`}>{segment.value}</span>;
    }
    return (
      <EntityMentionPill
        key={`e-${index}-${segment.entity.id}-${segment.value}`}
        entity={segment.entity}
        label={segment.value}
      />
    );
  });

  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>;
}

/** Wrap markdown text children with entity pills when plain strings. */
export function withInlineEntityPills(
  children: ReactNode,
  entities?: EntityMentionRef[]
): ReactNode {
  if (!entities?.length) return children;

  if (typeof children === 'string') {
    return <TextWithEntityPills text={children} entities={entities} />;
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <span key={i}>{withInlineEntityPills(child, entities)}</span>
    ));
  }

  return children;
}
