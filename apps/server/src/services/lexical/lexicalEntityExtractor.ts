/**
 * Candidate entity extraction — proper nouns, organizations, skills, roles, dates.
 */
import { discoverEntities } from '../ontology/lexicalIntelligence';
import { mapDomainToLexicalEntityType } from '../ontology/canonical';
import type { LexicalEntity, LexicalEntityType } from './lexicalTypes';
import { normalizeLexicalText, padForScan, titleCase } from './lexicalNormalizer';

const ORG_CUES = [
  /\b(?:worked|works?|working|employed|interned|joined|started)\s+(?:at|for|with)\s+([A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3})(?=[.,!?;:\s]|$|\s+(?:on|and|with|who)\b)/g,
  /\b(?:at|for)\s+([A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3})\s+(?:as|where|when)\b/g,
];

const ROLE_CUES = [
  /\b(?:as (?:a|an)|role (?:of|as)|position (?:of|as))\s+([a-z][\w\s-]{2,40})/gi,
  /\b(?:i am|i'm)\s+(?:a|an)\s+([a-z][\w\s-]{2,40})\b/gi,
];

const SKILL_CUES = [
  /\b(?:better at|good at|great at|learning|studying|practicing|training in|getting better at)\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
  /\b(?:my main thing is|main thing is|passion (?:for|is)|love (?:doing|practicing))\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
  /\b([A-Za-z][\w+#. -]{1,30})\s+is\s+still\s+my\s+main\s+thing\b/gi,
];

const DATE_CUES = [
  /\b(\d{4}-\d{2}-\d{2})\b/g,
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)\b/gi,
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
];

const TIME_CUES = [
  /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/gi,
  /\b(?:this morning|tonight|last night|yesterday|today|tomorrow)\b/gi,
];

const KNOWN_TECH = new Set([
  'ros', 'ros2', 'python', 'typescript', 'javascript', 'react', 'supabase',
  'c++', 'rust', 'go', 'java', 'kubernetes', 'docker', 'aws', 'gcp',
]);

const KNOWN_MARTIAL = new Set([
  'muay thai', 'bjj', 'brazilian jiu-jitsu', 'jiu-jitsu', 'boxing', 'wrestling',
  'karate', 'judo', 'taekwondo', 'kickboxing', 'mma',
]);

function pushEntity(
  out: LexicalEntity[],
  seen: Set<string>,
  entity: Omit<LexicalEntity, 'normalized'> & { normalized?: string }
): void {
  const normalized = entity.normalized ?? normalizeLexicalText(entity.surface);
  const key = `${entity.type}:${normalized}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ ...entity, normalized });
}

function inferSkillSubcategory(name: string): string {
  const n = normalizeLexicalText(name);
  if (KNOWN_TECH.has(n) || /\b(ros|api|sdk|sql|html|css)\b/.test(n)) return 'TECHNOLOGY';
  if (KNOWN_MARTIAL.has(n) || /\b(thai|jiu|jitsu|boxing|wrestling)\b/.test(n)) return 'MARTIAL_ART';
  return 'GENERAL';
}

export function extractLexicalEntities(text: string): LexicalEntity[] {
  const out: LexicalEntity[] = [];
  const seen = new Set<string>();

  for (const d of discoverEntities(text)) {
    pushEntity(out, seen, {
      surface: d.surface,
      type: mapDomainToLexicalEntityType(d.domain, d.category),
      subcategory: d.subcategory ?? d.category,
      confidence: d.confidence,
      source: d.reason,
    });
  }

  for (const re of ORG_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1].trim().replace(/[,.]$/, '');
      const name = raw.replace(/\s+and\b[\s\S]*$/i, '').replace(/\s+i['']m\b[\s\S]*$/i, '').trim();
      if (name.length < 2 || !/[A-Z]/.test(name)) continue;
      pushEntity(out, seen, {
        surface: name,
        type: 'ORGANIZATION',
        subcategory: 'EMPLOYER',
        confidence: 0.82,
        source: 'org_cue',
      });
    }
  }

  for (const re of ROLE_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const role = m[1].trim().replace(/[,.]$/, '');
      pushEntity(out, seen, {
        surface: role,
        type: 'ROLE',
        confidence: 0.7,
        source: 'role_cue',
      });
    }
  }

  for (const re of SKILL_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const skill = m[1].trim().replace(/[,.]$/, '');
      if (skill.length < 2) continue;
      pushEntity(out, seen, {
        surface: skill,
        type: 'SKILL',
        subcategory: inferSkillSubcategory(skill),
        confidence: 0.75,
        source: 'skill_cue',
      });
    }
  }

  const mainThing = text.match(/\b([A-Za-z][\w+#. -]{1,30})\s+is\s+still\s+my\s+main\s+thing\b/i);
  if (mainThing?.[1]) {
    pushEntity(out, seen, {
      surface: mainThing[1].trim(),
      type: 'SKILL',
      subcategory: inferSkillSubcategory(mainThing[1]),
      confidence: 0.88,
      source: 'main_thing',
    });
  }

  for (const re of DATE_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      pushEntity(out, seen, {
        surface: m[1],
        type: 'DATE',
        confidence: 0.9,
        source: 'date_pattern',
      });
    }
  }

  for (const re of TIME_CUES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      pushEntity(out, seen, {
        surface: m[1] ?? m[0],
        type: 'TIME',
        confidence: 0.75,
        source: 'time_cue',
      });
    }
  }

  const identityClaim = /\b([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,3})\s+(?:is|was)\s+(?:actually\s+)?me\b/i.exec(text);
  if (identityClaim?.[1]) {
    pushEntity(out, seen, {
      surface: identityClaim[1],
      type: 'IDENTITY_CLAIM',
      confidence: 0.9,
      source: 'identity_claim',
    });
  }

  const properNouns = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g) ?? [];
  for (const pn of properNouns) {
    if (out.some((e) => normalizeLexicalText(e.surface) === normalizeLexicalText(pn))) continue;
    pushEntity(out, seen, {
      surface: pn,
      type: 'OBJECT',
      subcategory: 'PROPER_NOUN',
      confidence: 0.35,
      source: 'proper_noun',
    });
  }

  return out;
}

export { titleCase, padForScan };
