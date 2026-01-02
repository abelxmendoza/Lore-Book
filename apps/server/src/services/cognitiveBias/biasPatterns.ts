import type { BiasType } from './types';

export interface BiasPattern {
  type: BiasType;
  regex: RegExp;
}

export const biasPatterns: BiasPattern[] = [
  {
    type: 'confirmation_bias',
    regex: /(i knew it|i was right all along|i expected that)/i,
  },
  {
    type: 'catastrophizing',
    regex: /(ruined everything|worst case|it's over|disaster)/i,
  },
  {
    type: 'mind_reading',
    regex: /(she probably thinks|they must think|i know they feel)/i,
  },
  {
    type: 'emotional_reasoning',
    regex: /(i feel like so it must be true|i felt it was real so)/i,
  },
  {
    type: 'black_white_thinking',
    regex: /(always|never|completely|totally|entirely)/i,
  },
  {
    type: 'overgeneralization',
    regex: /(everyone|nobody|all people|all women|all men)/i,
  },
  {
    type: 'personalization',
    regex: /(it's my fault|they reacted because of me|i caused this)/i,
  },
  {
    type: 'projection',
    regex: /(i bet they're thinking like me|they feel what i feel)/i,
  },
  {
    type: 'halo_effect',
    regex: /(she's perfect|he's flawless|they can do no wrong)/i,
  },
  {
    type: 'spotlight_effect',
    regex: /(everyone noticed|everyone saw me|they were all judging)/i,
  },
  {
    type: 'optimism_bias',
    regex: /(it'll work out no matter what|i know it'll be fine)/i,
  },
  {
    type: 'negativity_bias',
    regex: /(the good doesn't matter|only bad things happen)/i,
  },
  {
    type: 'self_serving_bias',
    regex: /(i deserved better|they messed up, not me)/i,
  },
];

