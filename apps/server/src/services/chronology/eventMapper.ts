import type { MemoryEntry, MemoryComponent } from '../../types';

import type { Event } from './types';

/**
 * Maps MemoryEntry and MemoryComponent to Chronology Engine Event type
 */
export class EventMapper {
  /**
   * Map MemoryEntry to Event
   */
  mapMemoryEntryToEvent(entry: MemoryEntry): Event {
    return {
      id: entry.id,
      timestamp: entry.date || null,
      content: entry.content,
      embedding: entry.embedding || [],
      metadata: {
        ...entry.metadata,
        source: entry.source,
        tags: entry.tags,
        mood: entry.mood,
        summary: entry.summary,
        chapterId: entry.chapter_id,
        userId: entry.user_id,
      },
    };
  }

  /**
   * Map MemoryComponent to Event
   */
  mapMemoryComponentToEvent(component: MemoryComponent): Event {
    return {
      id: component.id,
      timestamp: component.timestamp || null,
      content: component.text,
      embedding: component.embedding || [],
      metadata: {
        ...component.metadata,
        componentType: component.component_type,
        charactersInvolved: component.characters_involved,
        location: component.location,
        tags: component.tags,
        importanceScore: component.importance_score,
        journalEntryId: component.journal_entry_id,
      },
    };
  }

  /**
   * Map multiple MemoryEntries to Events
   */
  mapMemoryEntriesToEvents(entries: MemoryEntry[]): Event[] {
    return entries.map(entry => this.mapMemoryEntryToEvent(entry));
  }

  /**
   * Map multiple MemoryComponents to Events
   */
  mapMemoryComponentsToEvents(components: MemoryComponent[]): Event[] {
    return components.map(component => this.mapMemoryComponentToEvent(component));
  }

  /**
   * Map mixed array of MemoryEntries and MemoryComponents to Events
   */
  mapMixedToEvents(
    entries: MemoryEntry[],
    components: MemoryComponent[]
  ): Event[] {
    const entryEvents = this.mapMemoryEntriesToEvents(entries);
    const componentEvents = this.mapMemoryComponentsToEvents(components);
    return [...entryEvents, ...componentEvents];
  }
}

