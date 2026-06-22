import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import type { AmbiguousCharacterContext } from './characterCardAuditTypes';

export type ContextualRepairHint = {
  suggestedTitle: string;
  confidence: number;
  storyContexts: string[];
  environments: string[];
  linkedPeople: string[];
  linkedEvents: string[];
  linkedPlaces: string[];
};

const CONTEXT_RULES: Array<{
  rolePattern: RegExp;
  build: (ctx: ProvenanceScan) => ContextualRepairHint | null;
}> = [
  {
    rolePattern: /^potential\s+investor$/i,
    build: (ctx) => {
      if (!ctx.hasAntler) return null;
      return {
        suggestedTitle: 'Potential Investor from Antler',
        confidence: 0.9,
        storyContexts: ['Antler'],
        environments: ctx.environments,
        linkedPeople: ctx.linkedPeople,
        linkedEvents: ctx.linkedEvents,
        linkedPlaces: ctx.linkedPlaces,
      };
    },
  },
  {
    rolePattern: /^old\s+college\s+roommate$/i,
    build: (ctx) => {
      const school = ctx.schools[0];
      if (!school) return null;
      return {
        suggestedTitle: `Old College Roommate from ${school}`,
        confidence: 0.85,
        storyContexts: [school],
        environments: ctx.environments,
        linkedPeople: ctx.linkedPeople,
        linkedEvents: ctx.linkedEvents,
        linkedPlaces: ctx.linkedPlaces,
      };
    },
  },
  {
    rolePattern: /^(?:the\s+)?new\s+guy$/i,
    build: (ctx) => {
      if (ctx.linkedPeople.includes('Noah')) {
        return {
          suggestedTitle: 'New Guy with Noah',
          confidence: 0.88,
          storyContexts: ctx.storyContexts,
          environments: ctx.environments,
          linkedPeople: ['Noah', ...ctx.linkedPeople.filter((p) => p !== 'Noah')],
          linkedEvents: ctx.linkedEvents,
          linkedPlaces: ctx.linkedPlaces,
        };
      }
      const event = ctx.linkedEvents.find((e) => /ska prom/i.test(e));
      if (event) {
        return {
          suggestedTitle: 'New Guy from Ska Prom',
          confidence: 0.85,
          storyContexts: ctx.storyContexts,
          environments: ctx.environments,
          linkedPeople: ctx.linkedPeople,
          linkedEvents: [event],
          linkedPlaces: ctx.linkedPlaces,
        };
      }
      return null;
    },
  },
];

type ProvenanceScan = {
  text: string;
  hasAntler: boolean;
  schools: string[];
  environments: string[];
  linkedPeople: string[];
  linkedEvents: string[];
  linkedPlaces: string[];
  storyContexts: string[];
};

function scanProvenance(text: string): ProvenanceScan {
  const lower = text.toLowerCase();
  const schools: string[] = [];
  if (/\bcsuf\b|cal state fullerton|fullerton\b/i.test(text)) schools.push('CSUF');
  if (/\bucla\b/i.test(text)) schools.push('UCLA');
  if (/\busc\b/i.test(text)) schools.push('USC');

  const linkedEvents: string[] = [];
  if (/ska prom/i.test(text)) linkedEvents.push('Ska Prom');
  if (/club metro/i.test(text)) linkedEvents.push('Club Metro');
  if (/gothicumbia/i.test(text)) linkedEvents.push('Gothicumbia');

  const linkedPeople: string[] = [];
  for (const person of ['Noah', 'Ashley', 'James', 'Jerry', 'Sam', 'Lourdes', 'Ben']) {
    if (new RegExp(`\\b${person}\\b`, 'i').test(text)) linkedPeople.push(person);
  }

  const environments: string[] = [];
  if (/antler/i.test(text)) environments.push('Antler');
  if (/underground|ska scene|goth scene/i.test(text)) environments.push('Underground scene');

  const storyContexts = [
    ...schools,
    ...linkedEvents,
    ...environments,
  ].filter(Boolean);

  return {
    text,
    hasAntler: /antler/i.test(text),
    schools,
    environments,
    linkedPeople,
    linkedEvents,
    linkedPlaces: linkedEvents,
    storyContexts,
  };
}

export function suggestContextualTitle(
  currentTitle: string,
  provenanceText: string,
): ContextualRepairHint | null {
  const key = normalizePersonNameKey(currentTitle);
  const scan = scanProvenance(provenanceText);

  for (const rule of CONTEXT_RULES) {
    if (!rule.rolePattern.test(key)) continue;
    const hint = rule.build(scan);
    if (hint) return hint;
  }

  return null;
}

export function buildAmbiguousContext(
  roleLabel: string,
  contextualTitle: string,
  provenanceText: string,
  sourceMessageIds: string[] = [],
): AmbiguousCharacterContext {
  const scan = scanProvenance(provenanceText);
  return {
    roleLabel,
    contextualTitle,
    sourceMessageIds,
    storyContexts: scan.storyContexts,
    environments: scan.environments,
    timeHints: [],
    linkedPeople: scan.linkedPeople,
    linkedEvents: scan.linkedEvents,
    linkedPlaces: scan.linkedPlaces,
    confidence: contextualTitle.includes(' from ') || contextualTitle.includes(' with ') ? 0.85 : 0.5,
    identityResolutionStatus: 'unresolved',
  };
}

export { scanProvenance };
