import { useMemo } from 'react';
import { EntityChipsRow } from '../message/EntityChipsRow';
import type { Message } from '../message/ChatMessage';
import { collectThreadEntities, type ThreadEntity } from '../utils/collectThreadEntities';
import { collectThreadRelationshipGroups } from '../utils/relationshipMetadata';
import { RelationshipGroupsRow } from '../message/RelationshipGroupsRow';

interface ThreadEntityChipsProps {
  messages: Message[];
  /** Inline above messages (legacy) vs sticky strip above the composer */
  variant?: 'inline' | 'composer';
  selectedEntityId?: string | null;
  onSelectEntity?: (entity: ThreadEntity | null) => void;
}

/**
 * Thread-level confirmed entity strip — every resolved entity the conversation
 * has established. In composer mode, clicking a chip focuses the next message
 * on that entity so LoreBook builds on existing knowledge.
 */
export const ThreadEntityChips = ({
  messages,
  variant = 'inline',
  selectedEntityId = null,
  onSelectEntity,
}: ThreadEntityChipsProps) => {
  const entities = useMemo(() => collectThreadEntities(messages), [messages]);
  const relationshipGroups = useMemo(() => collectThreadRelationshipGroups(messages), [messages]);

  if (entities.length === 0 && relationshipGroups.length === 0) return null;

  const isComposer = variant === 'composer';

  return (
    <div
      className={
        isComposer
          ? 'flex-shrink-0 border-t border-white/10 bg-black/50 backdrop-blur-sm'
          : 'px-4 pt-1 flex-shrink-0'
      }
    >
      <div
        className={
          isComposer
            ? 'mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] px-3 sm:px-4 lg:px-10 xl:px-12 py-2'
            : undefined
        }
      >
        <EntityChipsRow
          entities={entities}
          label={isComposer ? 'building on:' : 'this thread knows:'}
          max={isComposer ? 10 : 8}
          mode={isComposer ? 'focus' : 'navigate'}
          selectedId={selectedEntityId}
          onSelect={
            isComposer
              ? (entity) => {
                  if (!onSelectEntity) return;
                  onSelectEntity(selectedEntityId === entity.id ? null : entity);
                }
              : undefined
          }
        />
        {relationshipGroups.length > 0 && (
          <RelationshipGroupsRow
            groups={relationshipGroups}
            label={isComposer ? 'relationship context:' : 'relationships in thread:'}
            max={isComposer ? 5 : 4}
          />
        )}
        {isComposer && selectedEntityId && (
          <p className="mt-1 text-[10px] text-white/35">
            Next message focuses on{' '}
            <span className="text-white/55">
              {entities.find((e) => e.id === selectedEntityId)?.name ?? 'this entity'}
            </span>
            . Click again to clear.
          </p>
        )}
      </div>
    </div>
  );
};
