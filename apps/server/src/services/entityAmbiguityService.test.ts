import { describe, expect, it } from 'vitest';

import { entityAmbiguityService } from './entityAmbiguityService';

describe('EntityAmbiguityService person mention extraction', () => {
  it('keeps plausible names while dropping sentence and time fragments', () => {
    const message = [
      'Like, a lot is weighing on me with Ashley and Annie.',
      'Tomorrow Im preparing for Rivian with Connor.',
      'Fridays are usually difficult, but Tia Lourdes will help.',
      'Fitness helps, but Police contact was stressful.',
    ].join(' ');

    const mentions = entityAmbiguityService
      .extractEntityMentions(message)
      .map(mention => mention.text);

    expect(mentions).toEqual(expect.arrayContaining(['Ashley', 'Annie', 'Connor', 'Tia Lourdes']));
    expect(mentions).not.toEqual(expect.arrayContaining(['Like', 'Tomorrow Im', 'Fridays']));
    expect(mentions).not.toEqual(expect.arrayContaining(['Fitness', 'Police']));
  });
});
