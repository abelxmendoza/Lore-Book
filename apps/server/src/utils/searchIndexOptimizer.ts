export type CompositeIndex = readonly [string, ...string[]];

export class SearchIndexOptimizer {
  private indexes: CompositeIndex[] = [
    ['event_time', 'tag'],
    ['tag', 'created_at'],
    ['character_id', 'event_id']
  ];

  getIndexes(): CompositeIndex[] {
    return this.indexes;
  }

  apply<K extends { ensureIndex?: (fields: CompositeIndex) => void }>(adapter: K): void {
    if (!adapter || typeof adapter.ensureIndex !== 'function') return;
    this.indexes.forEach((idx) => adapter.ensureIndex?.(idx));
  }
}
