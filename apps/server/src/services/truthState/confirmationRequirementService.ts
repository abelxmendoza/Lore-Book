import type { SensitiveCategory, TruthAttachmentType } from './truthStateTypes';
import { LOW_CONFIDENCE_THRESHOLD } from './truthStateTypes';

const SENSITIVE_RULES: Array<{ category: SensitiveCategory; patterns: RegExp[] }> = [
  {
    category: 'family',
    patterns: [
      /\b(?:my|our)\s+(?:mother|father|mom|dad|brother|sister|parent|son|daughter|uncle|aunt|cousin|grandma|grandpa)\b/i,
      /\b(?:family|sibling|step-?parent|step-?brother|step-?sister)\b/i,
    ],
  },
  {
    category: 'romantic',
    patterns: [
      /\b(?:boyfriend|girlfriend|husband|wife|partner|romantic|dating|fianc[ée]e|ex-?(?:boyfriend|girlfriend|wife|husband))\b/i,
      /\b(?:my|our)\s+(?:crush|lover)\b/i,
    ],
  },
  {
    category: 'conflict',
    patterns: [
      /\b(?:fight|fought|argument|threat|assault|abuse|cheated|betrayed|harass|violence|divorce)\b/i,
    ],
  },
  {
    category: 'identity',
    patterns: [
      /\b(?:legal name|birth name|deadname|gender|sexuality|trans|nonbinary|identity)\b/i,
      /\b(?:his|her|their)\s+name\s+is\b/i,
    ],
  },
  {
    category: 'residence',
    patterns: [/\b(?:live at|lives at|address|apartment|home is|private residence)\b/i],
  },
  {
    category: 'health',
    patterns: [
      /\b(?:diagnosis|medication|therapy|disorder|hospital|surgery|depression|anxiety|cancer|pregnant)\b/i,
    ],
  },
  {
    category: 'finance',
    patterns: [/\b(?:salary|debt|bankruptcy|rent|mortgage|finances?|bank account|credit score)\b/i],
  },
  {
    category: 'substance',
    patterns: [
      /\b(?:drunk|intoxicated|tequila|vodka|whiskey|weed|cocaine|meth|high|substance|overdose)\b/i,
    ],
  },
  {
    category: 'minor_discipline',
    patterns: [
      /\b(?:expelled|suspended|detention|minor|underage|school discipline)\b/i,
    ],
  },
  {
    category: 'employment',
    patterns: [
      /\b(?:fired|laid off|terminated|resigned|quit my job|employment status|offer rescinded)\b/i,
    ],
  },
];

const RELATIONSHIP_SENSITIVE = /\b(?:best friend|schoolmate|coworker|brother|sister|boyfriend|girlfriend)\b/i;

export function detectSensitiveCategories(
  claimText: string,
  sourceQuote: string,
  claimType: TruthAttachmentType,
): SensitiveCategory[] {
  const blob = `${claimText} ${sourceQuote}`;
  const found = SENSITIVE_RULES.filter(({ patterns }) =>
    patterns.some((re) => re.test(blob)),
  ).map(({ category }) => category);

  if (claimType === 'relationship' && RELATIONSHIP_SENSITIVE.test(blob)) {
    if (!found.includes('family') && /\b(?:brother|sister|parent|family)\b/i.test(blob)) {
      found.push('family');
    }
    if (!found.includes('romantic') && /\b(?:boyfriend|girlfriend|partner|dating)\b/i.test(blob)) {
      found.push('romantic');
    }
  }

  return [...new Set(found)];
}

export function requiresConfirmation(categories: SensitiveCategory[]): boolean {
  return categories.length > 0;
}

export function requiresRelationshipConfirmation(
  claimType: TruthAttachmentType,
  categories: SensitiveCategory[],
): boolean {
  if (claimType !== 'relationship') return requiresConfirmation(categories);
  return (
    categories.includes('family') ||
    categories.includes('romantic') ||
    categories.includes('conflict') ||
    categories.length > 0
  );
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}

export function blocksDurableWrite(confidence: number, categories: SensitiveCategory[]): boolean {
  return isLowConfidence(confidence) || requiresConfirmation(categories);
}
