import { describe, it, expect } from 'vitest';
import {
  assertValidEdge,
  CAUSAL_TYPE_TO_SPINE,
  detectRelationFromPhrase,
  RELATION_REGISTRY,
} from './relationshipRegistry';

describe('relationshipRegistry', () => {
  it('validates allowed node kind pairs', () => {
    const result = assertValidEdge('FRIEND_OF', 'person', 'person');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid node kind pairs', () => {
    const result = assertValidEdge('FRIEND_OF', 'event', 'person');
    expect(result.valid).toBe(false);
  });

  it('maps causal types to narrative spine relations', () => {
    expect(CAUSAL_TYPE_TO_SPINE.causes).toBe('caused');
    expect(CAUSAL_TYPE_TO_SPINE.triggers).toBe('caused');
    expect(CAUSAL_TYPE_TO_SPINE.enables).toBe('led_to');
  });

  it('detects relations from phrase cues', () => {
    expect(detectRelationFromPhrase('works at Google')?.relation).toBe('WORKS_AT');
    expect(detectRelationFromPhrase('friend of mine')?.relation).toBe('FRIEND_OF');
  });

  it('registers core relation metadata', () => {
    expect(RELATION_REGISTRY.WORKS_AT).toBeDefined();
    expect(RELATION_REGISTRY.CAUSED).toBeDefined();
  });
});
