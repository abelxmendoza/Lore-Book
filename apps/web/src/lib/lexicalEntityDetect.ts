/**
 * Deterministic entity detection for demo / offline mode.
 * Uses the same ontology glossary + cue patterns as the server lexical layer — no LLM.
 */

import { glossaryAliases, lookupKeyword } from '../../../server/src/services/ontology/glossary';
import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { isIndividualPersonName } from './personNameValidation';
import { isGenericVenueAlias } from './lexicalComposerParse';

const HINT_ONLY_CATEGORIES = new Set([
  'RELATIONSHIP_VERB', 'IDENTITY_VERB', 'DISAMBIGUATION', 'NAV_VERB',
  'ESSENCE_SIGNAL', 'SHADOW_SIGNAL', 'IDENTITY_SIGNAL', 'CONTRADICTION_SIGNAL',
  'DECISION_SIGNAL', 'MEMORY_SIGNAL', 'CORRECTION_VERB', 'RECALL_VERB',
  'ENTITY_AUTHORITY', 'ANALYTICS_SIGNAL', 'INSIGHT_SIGNAL', 'HABIT', 'VALUE',
  'STANCE_PREFERENCE', 'STANCE_EPISTEMIC', 'STANCE_AFFECT',
  'SOCIAL_ROLE', 'NARRATIVE_DISCOURSE', 'NARRATIVE_STAGE', 'TEMPORAL_ANCHOR', 'TEMPORAL_SEQUENCE',
]);

const ORG_CUES = [
  /\b(?:worked|works?|working|employed|interned|joined|started)\s+(?:at|for|with)\s+([A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3})(?=[.,!?;:\s]|$|\s+(?:on|and|with|who)\b)/g,
  /\b(?:at|for)\s+([A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3})\s+(?:as|where|when)\b/g,
];

const SKILL_CUES = [
  /\b(?:better at|good at|great at|learning|studying|practicing|training in|getting better at)\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
  /\b(?:my main thing is|main thing is|passion (?:for|is)|love (?:doing|practicing))\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
  /\b([A-Za-z][\w+#. -]{1,30})\s+is\s+still\s+my\s+main\s+thing\b/gi,
];

const TITLED_KINSHIP =
  /\b(?:[Mm]y|[Oo]ur)\s+(?:[Aa]unt|[Uu]ncle|[Nn]iece|[Nn]ephew|[Tt]ía|[Tt]ia|[Tt]ío|[Tt]io|[Cc]ousin|[Pp]rimo|[Pp]rima|[Bb]rother|[Ss]ister|[Hh]ermano|[Hh]ermana|[Nn]ana|[Aa]buela|[Aa]buelo|[Gg]randma|[Gg]randpa|[Gg]odmother|[Gg]odfather|[Ss]tepmom|[Ss]tepdad|[Ss]tepmother|[Ss]tepfather)\s+([A-ZÀ-Ý][\w''-]+(?:\s+[A-ZÀ-Ý][\w''-]+)?)\b/g;

export type LexicalOntologyHit = {
  name: string;
  type: CertifiedEntityType;
  confidence: number;
  source: string;
  domain: string;
  category: string;
};

const norm = (s: string) => (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function mapDomainToCertifiedType(domain: string, category: string): CertifiedEntityType | null {
  if (category === 'FAMILY' || domain === 'PERSON') return 'character';
  if (domain === 'LOCATION') return 'location';
  if (domain === 'ORGANIZATION' || domain === 'GROUP' || category === 'COMPANY') return 'organization';
  if (domain === 'SKILL') return 'skill';
  if (domain === 'EVENT') return 'event';
  if (domain === 'BRAND') return 'organization';
  return null;
}

function discoverGlossaryEntities(text: string): LexicalOntologyHit[] {
  const out: LexicalOntologyHit[] = [];
  const padded = ` ${norm(text)} `;

  const possessive = /\b([a-zà-ÿ][\wà-ÿ'’.-]*)'s\s+(house|home|place|apartment|spot|crib|casa|studio|gym|dojo)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = possessive.exec(padded)) !== null) {
    const owner = m[1];
    const ownerEntry = lookupKeyword(owner);
    if (ownerEntry?.category === 'FAMILY') {
      out.push({
        name: titleCase(owner),
        type: 'character',
        confidence: ownerEntry.confidence,
        source: 'ontology:kinship-owner',
        domain: 'PERSON',
        category: 'FAMILY',
      });
    }
    out.push({
      name: `${titleCase(owner)}'s ${titleCase(m[2])}`,
      type: 'location',
      confidence: 0.78,
      source: 'ontology:possessive-dwelling',
      domain: 'LOCATION',
      category: 'DWELLING',
    });
  }

  for (const { alias, entry } of glossaryAliases()) {
    if (HINT_ONLY_CATEGORIES.has(entry.category) || entry.domain === 'TIME') continue;
    if (entry.category === 'GEOGRAPHY' && !alias.includes(' ')) continue;
    if (isGenericVenueAlias(alias, entry.category)) continue;
    if (!padded.includes(` ${alias} `) && !padded.includes(` ${alias}'s `)) continue;

    const certifiedType = mapDomainToCertifiedType(entry.domain, entry.category);
    if (!certifiedType) continue;

    if (entry.category === 'FAMILY' && (entry.kinshipForm === 'TITLE_ONLY' || entry.kinshipForm === 'TITLED')) {
      continue;
    }

    out.push({
      name: titleCase(alias),
      type: certifiedType,
      confidence: entry.confidence,
      source: `ontology:glossary/${entry.domain}/${entry.category}`,
      domain: entry.domain,
      category: entry.category,
    });
  }

  return dedupeHits(out);
}

function discoverCueEntities(text: string): LexicalOntologyHit[] {
  const out: LexicalOntologyHit[] = [];

  for (const re of ORG_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim().replace(/[,.]$/, '').replace(/\s+and\b[\s\S]*$/i, '').trim();
      if (name.length < 2 || !/[A-Z]/.test(name)) continue;
      out.push({
        name,
        type: 'organization',
        confidence: 0.82,
        source: 'ontology:org-cue',
        domain: 'ORGANIZATION',
        category: 'COMPANY',
      });
    }
  }

  for (const re of SKILL_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const skill = m[1].trim().replace(/[,.]$/, '');
      if (skill.length < 2) continue;
      out.push({
        name: titleCase(skill),
        type: 'skill',
        confidence: 0.75,
        source: 'ontology:skill-cue',
        domain: 'SKILL',
        category: 'GENERAL',
      });
    }
  }

  TITLED_KINSHIP.lastIndex = 0;
  let kinship: RegExpExecArray | null;
  while ((kinship = TITLED_KINSHIP.exec(text)) !== null) {
    const name = kinship[1].trim();
    if (!isIndividualPersonName(name)) continue;
    out.push({
      name,
      type: 'character',
      confidence: 0.88,
      source: 'ontology:titled-kinship',
      domain: 'PERSON',
      category: 'FAMILY',
    });
  }

  return dedupeHits(out);
}

function dedupeHits(hits: LexicalOntologyHit[]): LexicalOntologyHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.type}:${norm(h.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeNameKey(name: string): string {
  return norm(name);
}

function collectCoveredKeys(
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[],
): Set<string> {
  const covered = new Set<string>();
  for (const entity of index) {
    covered.add(normalizeNameKey(entity.name));
    for (const alias of entity.aliases) covered.add(normalizeNameKey(alias));
    for (const key of entity.mentionKeys) covered.add(key);
  }
  for (const match of existingMatches) {
    covered.add(normalizeNameKey(match.name));
    covered.add(normalizeNameKey(match.matchedLabel));
  }
  return covered;
}

/** Run ontology-backed lexical discovery and return draft entity matches. */
export function detectLexicalDraftEntities(
  text: string,
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[],
): CertifiedEntityMatch[] {
  if (!text.trim()) return [];

  const covered = collectCoveredKeys(index, existingMatches);
  const seen = new Set<string>();
  const drafts: CertifiedEntityMatch[] = [];

  const addDraft = (hit: LexicalOntologyHit) => {
    const name = hit.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return;
    if (hit.type === 'character' && !isIndividualPersonName(name)) return;
    const key = normalizeNameKey(name);
    if (!key || covered.has(key) || seen.has(`${hit.type}:${key}`)) return;
    seen.add(`${hit.type}:${key}`);
    drafts.push({
      id: `draft:${hit.type}:${key}`,
      name,
      type: hit.type,
      aliases: [],
      mentionKeys: [key],
      status: 'draft',
      matchedLabel: name,
      matchKind: 'full',
    });
  };

  for (const hit of [...discoverGlossaryEntities(text), ...discoverCueEntities(text)]) {
    addDraft(hit);
  }

  return drafts.sort((a, b) => a.name.localeCompare(b.name));
}

/** Full lexical pass — returns ontology hits for demo chat metadata / debugging. */
export function analyzeLexicalOntology(text: string): LexicalOntologyHit[] {
  return dedupeHits([...discoverGlossaryEntities(text), ...discoverCueEntities(text)]);
}

/** Relationship hints from glossary relationship verbs (demo chat metadata). */
export function discoverLexicalRelationshipHints(text: string): string[] {
  const padded = ` ${norm(text)} `;
  const hints = new Set<string>();
  for (const { alias, entry } of glossaryAliases()) {
    if (entry.category !== 'RELATIONSHIP_VERB' || !entry.relationshipHint) continue;
    if (padded.includes(alias)) hints.add(entry.relationshipHint);
  }
  return [...hints];
}
