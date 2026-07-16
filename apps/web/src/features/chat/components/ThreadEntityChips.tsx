import { useMemo } from 'react';
import { EntityChipsRow } from '../message/EntityChipsRow';
import type { Message } from '../message/ChatMessage';
import { collectThreadEntities, type ThreadEntity } from '../utils/collectThreadEntities';
import { collectThreadRelationshipGroups } from '../utils/relationshipMetadata';
import { RelationshipGroupsRow } from '../message/RelationshipGroupsRow';

interface ThreadEntityChipsProps {
  messages: Message[];
  variant?: 'inline' | 'composer';
  selectedEntityId?: string | null;
  onSelectEntity?: (entity: ThreadEntity | null) => void;
}

/**
 * Thread-level entity strip above the composer — compact chips for established context.
 */
/** Composer strip only keeps recent thread context — not the whole history. */
const COMPOSER_ENTITY_WINDOW = 8;
const COMPOSER_ENTITY_MAX = 6;

export const ThreadEntityChips = ({
  messages,
  variant = 'inline',
  selectedEntityId = null,
  onSelectEntity,
}: ThreadEntityChipsProps) => {
  const isComposer = variant === 'composer';
  const entities = useMemo(
    () =>
      collectThreadEntities(
        messages,
        isComposer
          ? { recentMessageWindow: COMPOSER_ENTITY_WINDOW, max: COMPOSER_ENTITY_MAX }
          : undefined,
      ),
    [messages, isComposer],
  );
  const relationshipGroups = useMemo(() => collectThreadRelationshipGroups(messages), [messages]);

  if (entities.length === 0 && relationshipGroups.length === 0) return null;

  return (
    <div
      className={
        isComposer
          ? 'flex-shrink-0 border-t border-white/8 bg-black/45 backdrop-blur-sm px-3 sm:px-4 lg:px-10 xl:px-12 py-0.5'
          : 'px-4 pt-1 flex-shrink-0'
      }
    >
      <div className={isComposer ? 'mx-auto w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] space-y-0.5' : 'space-y-0.5'}>
        <EntityChipsRow
          entities={entities}
          label={isComposer ? 'building on' : 'Thread'}
          max={isComposer ? 8 : 6}
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
            label={isComposer ? 'Rel' : 'Rel'}
            max={isComposer ? 4 : 3}
          />
        )}
      </div>
    </div>
  );
};
