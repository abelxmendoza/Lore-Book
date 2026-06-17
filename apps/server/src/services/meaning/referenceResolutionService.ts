/**
 * Reference resolution — pronouns and deictic references within a message.
 */
import type { ResolvedEntity, ResolvedReference } from './meaningResolutionTypes';

const PRONOUN_RE = /\b(he|she|they|him|her|them|his|hers|their)\b/gi;
const DEICTIC_RE = /\b(that\s+(?:place|company|job|school)|my\s+(?:job|school))\b/gi;
const WORKS_AT_RE = /\b(?:works?|worked)\s+(?:at|for)\s+([A-Z][\w&'. -]{2,60})/i;

export function resolveReferences(
  text: string,
  entities: ResolvedEntity[],
  priorMentionedNames: string[] = []
): ResolvedReference[] {
  const references: ResolvedReference[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  let lastPerson: ResolvedEntity | null = entities.find((e) => e.kind === 'PERSON' && !e.isSelf) ?? null;
  let lastOrg: ResolvedEntity | null = entities.find((e) => e.kind === 'ORGANIZATION') ?? null;

  for (const prior of priorMentionedNames) {
    if (!lastPerson) {
      lastPerson = {
        surface: prior,
        normalized: prior.toLowerCase(),
        kind: 'PERSON',
        confidence: 0.6,
        resolutionReason: 'prior_thread_mention',
        requiresConfirmation: false,
      };
    }
  }

  for (const sentence of sentences) {
    const personIntro = sentence.match(/\b(?:met|saw|talked to|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    if (personIntro?.[1]) {
      const name = personIntro[1];
      lastPerson = entities.find((e) => e.surface === name) ?? {
        surface: name,
        normalized: name.toLowerCase(),
        kind: 'PERSON',
        confidence: 0.85,
        resolutionReason: 'introduced_in_sentence',
        requiresConfirmation: false,
      };
    }

    const orgIntro = sentence.match(/\b(?:at|for)\s+([A-Z][\w&'. -]{2,60})\b/);
    if (orgIntro?.[1]) {
      const name = orgIntro[1].trim().replace(/[,.]$/, '');
      lastOrg = entities.find((e) => e.normalized === name.toLowerCase()) ?? {
        surface: name,
        normalized: name.toLowerCase(),
        kind: 'ORGANIZATION',
        confidence: 0.75,
        resolutionReason: 'org_in_sentence',
        requiresConfirmation: false,
      };
    }

    PRONOUN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PRONOUN_RE.exec(sentence)) !== null) {
      if (!lastPerson) continue;
      const pronoun = m[1].toLowerCase();
      let relation: string | undefined;
      const workMatch = WORKS_AT_RE.exec(sentence);
      if (workMatch) relation = `works_at:${workMatch[1].trim()}`;
      references.push({
        reference: pronoun,
        antecedent: lastPerson.surface,
        antecedentKind: lastPerson.kind,
        relation,
        confidence: 0.82,
        resolutionReason: `pronoun_${pronoun}_→_${lastPerson.surface}`,
      });
    }

    DEICTIC_RE.lastIndex = 0;
    while ((m = DEICTIC_RE.exec(sentence)) !== null) {
      const ref = m[1].toLowerCase();
      if (ref.includes('company') || ref.includes('job')) {
        if (!lastOrg) continue;
        references.push({
          reference: ref,
          antecedent: lastOrg.surface,
          antecedentKind: 'ORGANIZATION',
          confidence: 0.7,
          resolutionReason: `deictic_${ref}`,
        });
      }
    }
  }

  return dedupeRefs(references);
}

function dedupeRefs(refs: ResolvedReference[]): ResolvedReference[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.reference}:${r.antecedent}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
