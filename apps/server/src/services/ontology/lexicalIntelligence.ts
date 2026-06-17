/**
 * Lexical intelligence — turns the ontology + glossary into deterministic,
 * pre-LLM understanding:
 *   Phase 4  contextual lexicalization (a keyword's meaning depends on context)
 *   Phase 5  entity discovery (find entities before the model runs)
 *   Phase 6  relationship discovery (emit relationship hints)
 *   Phase 7  query intelligence (map a question to a query type)
 *   Phase 8  entity enrichment (keywords/aliases/ontology tags/relationship hints)
 */
import { glossaryAliases, lookupKeyword, type ActionHint, type GlossaryEntry, type RelationshipHint, type QueryHint, type RootType } from './glossary';

const norm = (s: string) => (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

// Scene/persona words that REDUCE kinship likelihood for a trailing kinship word
// (e.g. "Goth Tio" — goth + nightlife scene → persona, not uncle).
const SCENE_WORDS = /\b(goth|punk|club|dj|scene|stage|show|band|rave|set|warehouse|nightlife|metal|emo|drag|rapper|mc|producer)\b/;
// Family context words that INCREASE kinship likelihood.
const FAMILY_CONTEXT = /\b(my|our)\s+(uncle|aunt|tío|tía|tio|tia|mom|dad|mother|father|grandma|grandpa|abuela|abuelo|cousin|family|primo|prima|hermano|hermana)\b|\bfamily\b|\bthanksgiving\b|\breunion\b/;
const HANDLE_RE = /[.@\d_]/; // dots/handles/digits → stage name / handle

export interface KinshipVerdict {
  isKin: boolean;
  subcategory?: string;     // GRANDMOTHER, UNCLE, …
  relation?: string;        // grandparent, parent, aunt, uncle, cousin, sibling
  generation?: number;
  confidence: number;
  reason: string;
}

/**
 * Phase 4: decide whether a kinship-looking name actually denotes kin, using the
 * name's structure + surrounding context. Title-leading + family context ⇒ kin;
 * trailing keyword / handle / scene context ⇒ persona (not kin).
 */
export function scoreKinshipInContext(rawName: string, context = ''): KinshipVerdict {
  const name = (rawName ?? '').trim();
  const ctx = norm(context);
  if (!name) return { isKin: false, confidence: 0, reason: 'empty' };

  if (HANDLE_RE.test(name)) {
    return { isKin: false, confidence: 0.85, reason: 'handle/stage-name shape (punctuation/digits)' };
  }

  const lower = norm(name).replace(/^(my|our|the)\s+/, '');
  const stepped = /^step[-\s]?/.test(lower);
  const firstToken = lower.replace(/^step[-\s]?/, '').replace(/^great[-\s]?/, '').split(' ')[0];
  const titleEntry = lookupKeyword(firstToken);
  const isKinTitle = !!titleEntry && titleEntry.category === 'FAMILY';

  if (isKinTitle) {
    // Title-leading kinship → kin. Boost with explicit family context.
    const familyBoost = FAMILY_CONTEXT.test(ctx) ? 0.05 : 0;
    return {
      isKin: true,
      subcategory: titleEntry!.subcategory,
      relation: relationOf(titleEntry!),
      generation: stepped ? titleEntry!.generation : titleEntry!.generation,
      confidence: Math.min(1, (titleEntry!.confidence ?? 0.9) + familyBoost),
      reason: stepped ? 'title-leading step-kinship' : 'title-leading kinship',
    };
  }

  // Not title-leading but contains a kinship word somewhere → likely persona/stage name.
  const tokens = lower.split(' ');
  const hasTrailingKinship = tokens.some((t) => { const e = lookupKeyword(t); return e?.category === 'FAMILY'; });
  if (hasTrailingKinship) {
    const sceneish = SCENE_WORDS.test(`${lower} ${ctx}`);
    return {
      isKin: false,
      confidence: sceneish ? 0.85 : 0.6,
      reason: sceneish ? 'trailing kinship word + scene/persona context' : 'kinship word not in title position',
    };
  }
  return { isKin: false, confidence: 0.3, reason: 'no kinship signal' };
}

function relationOf(e: GlossaryEntry): string {
  switch (e.subcategory) {
    case 'GRANDMOTHER': case 'GRANDFATHER': return 'grandparent';
    case 'MOTHER': case 'FATHER': return 'parent';
    case 'AUNT': return 'aunt';
    case 'UNCLE': return 'uncle';
    case 'COUSIN': return 'cousin';
    case 'SIBLING': return 'sibling';
    default: return 'related';
  }
}

export interface DiscoveredEntity {
  surface: string;            // text as it appeared
  name: string;               // normalized display
  domain: RootType;
  category: string;
  subcategory?: string;
  confidence: number;
  reason: string;
}

/**
 * Phase 5: discover entities deterministically before LLM extraction.
 * Handles glossary aliases + possessive-dwelling composition
 * ("Abuela's house" → Abuela[FAMILY] + house[RESIDENCE] + Abuela's House[LOCATION]).
 */
export function discoverEntities(text: string): DiscoveredEntity[] {
  const out: DiscoveredEntity[] = [];
  const t = ` ${norm(text)} `;

  // Possessive dwelling: "<Proper>'s house/home/place" → a named LOCATION.
  const possessive = /\b([a-zà-ÿ][\wà-ÿ'’.-]*)'s\s+(house|home|place|apartment|spot|crib|casa)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = possessive.exec(t)) !== null) {
    const owner = m[1];
    const ownerEntry = lookupKeyword(owner);
    if (ownerEntry?.category === 'FAMILY') {
      out.push({ surface: owner, name: titleCase(owner), domain: 'PERSON', category: 'FAMILY', subcategory: ownerEntry.subcategory, confidence: ownerEntry.confidence, reason: 'kinship owner of dwelling' });
    } else {
      out.push({ surface: owner, name: titleCase(owner), domain: 'PERSON', category: 'PERSON', confidence: 0.6, reason: 'possessive owner (proper noun)' });
    }
    out.push({ surface: `${owner}'s ${m[2]}`, name: `${titleCase(owner)}'s ${titleCase(m[2])}`, domain: 'LOCATION', category: 'DWELLING', subcategory: 'RESIDENCE', confidence: 0.78, reason: 'possessive dwelling composition' });
  }

  // Glossary alias scan (longest-first; skip relationship verbs + time cues — those are hints/queries).
  for (const { alias, entry } of glossaryAliases()) {
    if (entry.category === 'RELATIONSHIP_VERB' || entry.domain === 'TIME') continue;
    if (t.includes(` ${alias} `) || t.includes(` ${alias}'s `)) {
      out.push({ surface: alias, name: titleCase(alias), domain: entry.domain, category: entry.category, subcategory: entry.subcategory, confidence: entry.confidence, reason: `glossary:${entry.domain}/${entry.category}` });
    }
  }
  return dedupe(out);
}

export interface RelationshipHintHit {
  cue: string;
  hint: RelationshipHint;
  confidence: number;
}

/** Phase 6: emit relationship hints from relationship-verb cues. */
export function discoverRelationshipHints(text: string): RelationshipHintHit[] {
  const t = ` ${norm(text)} `;
  const hits: RelationshipHintHit[] = [];
  for (const { alias, entry } of glossaryAliases()) {
    if (entry.category !== 'RELATIONSHIP_VERB' || !entry.relationshipHint) continue;
    if (t.includes(alias)) hits.push({ cue: alias, hint: entry.relationshipHint, confidence: entry.confidence });
  }
  return dedupeBy(hits, (h) => h.hint);
}

/** Phase 7: classify a question into a query type from keyword cues. */
export function classifyQueryType(text: string): { queryHint: QueryHint | null; cue?: string; confidence: number } {
  const t = ` ${norm(text)} `;
  let best: { queryHint: QueryHint; cue: string; confidence: number } | null = null;
  for (const { alias, entry } of glossaryAliases()) {
    if (!entry.queryHint) continue;
    if (t.includes(alias)) {
      const score = entry.confidence * entry.weight;
      if (!best || score > best.confidence) best = { queryHint: entry.queryHint, cue: alias, confidence: score };
    }
  }
  return best ?? { queryHint: null, confidence: 0 };
}

export interface ActionIntentHit {
  actionHint: ActionHint;
  cue: string;
  confidence: number;
}

/** Phase 7b: classify CRUD / UI action intents from keyword cues. */
export function classifyActionIntent(text: string): {
  hits: ActionIntentHit[];
  queryType: ReturnType<typeof classifyQueryType>;
  relationshipHints: RelationshipHintHit[];
} {
  const t = ` ${norm(text)} `;
  const hits: ActionIntentHit[] = [];
  for (const { alias, entry } of glossaryAliases()) {
    if (!entry.actionHint) continue;
    if (t.includes(alias)) {
      const score = entry.confidence * entry.weight;
      if (!hits.some((h) => h.actionHint === entry.actionHint)) {
        hits.push({ actionHint: entry.actionHint, cue: alias, confidence: score });
      }
    }
  }
  hits.sort((a, b) => b.confidence - a.confidence);
  return {
    hits,
    queryType: classifyQueryType(text),
    relationshipHints: discoverRelationshipHints(text),
  };
}

/** Extract a proper-name claim from identity/disambiguation sentences. */
export function extractClaimedName(text: string): string | null {
  const trimmed = text.trim();
  const patterns = [
    /\b([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})\s+(?:is|was)\s+(?:actually\s+)?me\b/i,
    /\bmy(?:\s+legal)?\s+name\s+is\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})\b/i,
    /\bcall\s+me\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})\b/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1].trim();
  }
  const generic = trimmed.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/);
  return generic?.[1]?.trim() ?? null;
}

export function inferRelationshipRole(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\b(father|dad|papá|papa|padre)\b/.test(t)) return 'father';
  if (/\b(mother|mom|mamá|mama|madre)\b/.test(t)) return 'mother';
  if (/\b(uncle|tío|tio)\b/.test(t)) return 'uncle';
  if (/\b(aunt|tía|tia)\b/.test(t)) return 'aunt';
  if (/\b(grandmother|abuela|grandma)\b/.test(t)) return 'grandmother';
  if (/\b(grandfather|abuelo|grandpa)\b/.test(t)) return 'grandfather';
  if (/\b(brother|sister|sibling)\b/.test(t)) return 'sibling';
  if (/\b(estranged|estranged from)\b/.test(t)) return 'estranged';
  return undefined;
}

export interface EntityEnrichment {
  keywords: string[];
  aliases: string[];
  ontologyTags: string[];       // ROOT/CATEGORY/SUBCATEGORY
  domainTags: RootType[];
  relationshipHints: RelationshipHint[];
}

/** Phase 8: enrich an entity name (+ optional context) for search/WMA/recall. */
export function enrichEntity(name: string, context = ''): EntityEnrichment {
  const discovered = discoverEntities(`${name} ${context}`);
  const direct = lookupKeyword(norm(name).split(' ')[0]);
  const tags = new Set<string>();
  const domains = new Set<RootType>();
  const keywords = new Set<string>();
  const aliases = new Set<string>();
  const rels = new Set<RelationshipHint>();

  const consider = (e: GlossaryEntry | null) => {
    if (!e) return;
    tags.add(`${e.domain}/${e.category}${e.subcategory ? `/${e.subcategory}` : ''}`);
    domains.add(e.domain);
    keywords.add(e.keyword);
    e.aliases.forEach((a) => aliases.add(a));
    if (e.relationshipHint) rels.add(e.relationshipHint);
  };
  consider(direct);
  for (const d of discovered) {
    tags.add(`${d.domain}/${d.category}${d.subcategory ? `/${d.subcategory}` : ''}`);
    domains.add(d.domain);
  }
  for (const h of discoverRelationshipHints(`${name} ${context}`)) rels.add(h.hint);

  return {
    keywords: [...keywords],
    aliases: [...aliases],
    ontologyTags: [...tags],
    domainTags: [...domains],
    relationshipHints: [...rels],
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function titleCase(s: string): string {
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function dedupe(list: DiscoveredEntity[]): DiscoveredEntity[] {
  const seen = new Set<string>();
  return list.filter((d) => { const k = `${d.domain}:${norm(d.name)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
function dedupeBy<T>(list: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}
