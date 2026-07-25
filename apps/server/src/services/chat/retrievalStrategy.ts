export type RetrievalPath =
  | 'working_memory_only'
  | 'thread_scoped_fallback'
  | 'timeline_scoped_fallback'
  | 'entity_arc_fallback'
  | 'generic_memory_fallback';

export function chooseRetrievalPath(input: {
  hasWorkingMemory: boolean;
  contextKind?: string;
  entityQuery: boolean;
}): RetrievalPath {
  if (
    input.hasWorkingMemory &&
    input.contextKind !== 'thread' &&
    input.contextKind !== 'timeline'
  ) {
    return 'working_memory_only';
  }
  if (input.contextKind === 'thread') return 'thread_scoped_fallback';
  if (input.contextKind === 'timeline') return 'timeline_scoped_fallback';
  if (input.entityQuery) return 'entity_arc_fallback';
  return 'generic_memory_fallback';
}
