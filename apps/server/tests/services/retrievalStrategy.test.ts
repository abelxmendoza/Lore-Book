import { describe, expect, it } from 'vitest';

import { chooseRetrievalPath } from '../../src/services/chat/retrievalStrategy';

describe('chooseRetrievalPath', () => {
  it('uses Working Memory alone for ordinary turns with selected evidence', () => {
    expect(chooseRetrievalPath({
      hasWorkingMemory: true,
      entityQuery: true,
    })).toBe('working_memory_only');
  });

  it('preserves explicit thread and timeline scopes as fallbacks', () => {
    expect(chooseRetrievalPath({
      hasWorkingMemory: true,
      contextKind: 'thread',
      entityQuery: true,
    })).toBe('thread_scoped_fallback');
    expect(chooseRetrievalPath({
      hasWorkingMemory: true,
      contextKind: 'timeline',
      entityQuery: false,
    })).toBe('timeline_scoped_fallback');
  });

  it('uses legacy entity or generic retrieval only when WMA has no evidence', () => {
    expect(chooseRetrievalPath({
      hasWorkingMemory: false,
      entityQuery: true,
    })).toBe('entity_arc_fallback');
    expect(chooseRetrievalPath({
      hasWorkingMemory: false,
      entityQuery: false,
    })).toBe('generic_memory_fallback');
  });
});
