import { describe, it, expect } from 'vitest';
import { buildDemoLoreAgentTrace } from './demoAgentTrace';
import { certifiedTypeToLoreKind, loreKindForChip } from './loreEntities';

describe('loreEntities', () => {
  it('maps certified types to lore palette kinds', () => {
    expect(certifiedTypeToLoreKind('character')).toBe('person');
    expect(certifiedTypeToLoreKind('character', 'romantic')).toBe('relationship');
    expect(certifiedTypeToLoreKind('location')).toBe('place');
    expect(certifiedTypeToLoreKind('skill')).toBe('skill');
  });

  it('prefers explicit loreKind on chips', () => {
    expect(
      loreKindForChip({ type: 'event', loreKind: 'project' }),
    ).toBe('project');
    expect(
      loreKindForChip({ type: 'organization', loreKind: 'group' }),
    ).toBe('group');
  });
});

describe('buildDemoLoreAgentTrace', () => {
  it('builds a simulated trace with entity observations', () => {
    const trace = buildDemoLoreAgentTrace(
      'msg-1',
      'Alex and I met at Mission Beach to work on LoreBook',
    );
    expect(trace.enabled).toBe(true);
    expect(trace.pipeline?.factuality).toBe('simulated');
    expect(trace.runs.length).toBeGreaterThan(0);
    expect(trace.observations.some((o) => o.summary.includes('Alex'))).toBe(true);
    expect(trace.proposedActions.length).toBeGreaterThan(0);
  });

  it('detects project lore kind from demo fallbacks', () => {
    const trace = buildDemoLoreAgentTrace('msg-2', 'Shipping LoreBook project modal this week');
    expect(trace.observations.some((o) => /LoreBook|Resolved/i.test(o.summary))).toBe(true);
  });
});
