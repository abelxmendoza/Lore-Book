import type { DistortionType } from './distortionTypes';

export interface DistortionPatternGroup {
  type: DistortionType;
  patterns: RegExp[];
}

export const DISTORTION_PATTERNS: DistortionPatternGroup[] = [
  {
    type: 'catastrophizing',
    patterns: [
      /(i'm screwed|this is ruined|it's over|my life is over)/i,
      /(worst case|everything will go wrong)/i,
    ],
  },
  {
    type: 'romantic_projection',
    patterns: [
      /(she's the one|i'm obsessed|i can see our future|we're meant)/i,
      /(i don't know her but|something about her)/i,
    ],
  },
  {
    type: 'mind_reading',
    patterns: [
      /(they think i'm|she thinks i|everyone thinks)/i,
      /(they probably hate|she probably hates)/i,
    ],
  },
  {
    type: 'fortune_telling',
    patterns: [
      /(this will fail|it's gonna go bad|i know he'll)/i,
      /(i already know how this ends)/i,
    ],
  },
  {
    type: 'shame_spiral',
    patterns: [
      /(i'm worthless|i'm a loser|nobody respects me)/i,
      /(everyone saw|everyone knows)/i,
    ],
  },
  {
    type: 'idealization',
    patterns: [
      /(she's perfect|too good for me|angelic)/i,
      /(i put her on a pedestal)/i,
    ],
  },
  {
    type: 'devaluation',
    patterns: [
      /(everyone sucks|i hate everyone|they're trash)/i,
      /(they're nobodies|beneath me)/i,
    ],
  },
  {
    type: 'spotlight_effect',
    patterns: [
      /(everyone noticed|everyone is watching me)/i,
      /(the whole room saw)/i,
    ],
  },
];

