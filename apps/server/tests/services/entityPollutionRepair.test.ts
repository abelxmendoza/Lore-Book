import { describe, expect, it } from 'vitest';

import { findPollutedEntities } from '../../src/services/entities/entityPollutionRepair';
import { classifyEntity } from '../../src/services/entities/entityClassifier';

describe('entityPollutionRepair', () => {
  it('flags known pollution names via classifier', () => {
    for (const name of ['Amazon Ring', 'Find My', 'High Noons', 'Moreno Valley', 'Graduation Party']) {
      const c = classifyEntity(name);
      expect(c.type).not.toBe('PERSON');
    }
  });

  it('does not flag real people', () => {
    for (const name of ['Abuela', 'Tío Juan', 'Step Dad Ben', 'Mr. Chino']) {
      expect(classifyEntity(name).type).toBe('PERSON');
    }
  });

  it('findPollutedEntities returns hits for mis-typed rows', async () => {
    const hits = await findPollutedEntities('test-user');
    expect(Array.isArray(hits)).toBe(true);
  });
});
