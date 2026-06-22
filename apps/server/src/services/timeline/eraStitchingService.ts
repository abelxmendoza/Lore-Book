import type { StitchAttachmentTarget } from './timelineStitchingTypes';

type EraStitch = {
  eraLabel: string;
  narrativeAnchor: string;
  linkedTargets: StitchAttachmentTarget[];
};

const ERA_PATTERNS: Array<{
  pattern: RegExp;
  eraLabel: string;
  narrativeAnchor: string;
  extraLinks?: (text: string) => StitchAttachmentTarget[];
}> = [
  {
    pattern: /\bmiddle\s+school\b/i,
    eraLabel: 'Middle School Era',
    narrativeAnchor: 'Middle School Era',
    extraLinks: (text) => {
      const links: StitchAttachmentTarget[] = [];
      const bryan = text.match(/\b(Bryan)\b/i);
      if (bryan) {
        links.push({ attachedToType: 'relationship', attachedToLabel: bryan[1], confidence: 0.85 });
      }
      const school = text.match(/\b(Whittier\s+Christian\s+Middle\s+School)\b/i);
      if (school) {
        links.push({ attachedToType: 'school_period', attachedToLabel: school[1], confidence: 0.9 });
      }
      if (/\bband\b/i.test(text)) {
        links.push({ attachedToType: 'event', attachedToLabel: 'School Band', confidence: 0.8 });
      }
      if (/\bWednesday\b/i.test(text)) {
        links.push({ attachedToType: 'event', attachedToLabel: 'Wednesday Practice', confidence: 0.78 });
      }
      return links;
    },
  },
  {
    pattern: /\bchildhood\b/i,
    eraLabel: 'Childhood',
    narrativeAnchor: 'Childhood',
  },
  {
    pattern: /\bhigh\s+school\b/i,
    eraLabel: 'High School Era',
    narrativeAnchor: 'High School Era',
  },
  {
    pattern: /\bcollege\b|\bcsuf\b/i,
    eraLabel: 'College Era',
    narrativeAnchor: 'CSUF Era',
  },
  {
    pattern: /\bvanguard\s+robotics\b/i,
    eraLabel: 'Vanguard Robotics Era',
    narrativeAnchor: 'Vanguard Robotics Era',
    extraLinks: () => [
      { attachedToType: 'work_period', attachedToLabel: 'Vanguard Robotics', confidence: 0.9 },
    ],
  },
  {
    pattern: /\bamazon\b/i,
    eraLabel: 'Amazon Era',
    narrativeAnchor: 'Amazon Era',
    extraLinks: () => [
      { attachedToType: 'work_period', attachedToLabel: 'Amazon Era', confidence: 0.88 },
    ],
  },
  {
    pattern: /\blorebook\b/i,
    eraLabel: 'LoreBook Build Era',
    narrativeAnchor: 'LoreBook Build Era',
    extraLinks: () => [
      { attachedToType: 'project', attachedToLabel: 'LoreBook', confidence: 0.85 },
    ],
  },
  {
    pattern: /\bpandemic\b|\bbefore\s+covid\b/i,
    eraLabel: 'Pandemic Era',
    narrativeAnchor: 'Pandemic Era',
  },
];

export function stitchEraPhrases(text: string): EraStitch[] {
  const out: EraStitch[] = [];
  for (const { pattern, eraLabel, narrativeAnchor, extraLinks } of ERA_PATTERNS) {
    if (!pattern.test(text)) continue;
    const linkedTargets: StitchAttachmentTarget[] = [
      {
        attachedToType: 'narrative_anchor',
        attachedToLabel: narrativeAnchor,
        confidence: 0.82,
      },
      ...(extraLinks?.(text) ?? []),
    ];
    out.push({ eraLabel, narrativeAnchor, linkedTargets });
  }
  return out;
}
