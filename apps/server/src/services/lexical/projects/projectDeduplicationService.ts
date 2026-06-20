/**
 * Canonical keys + duplicate/similarity collapse for project suggestions.
 */

import { normalizeNameKey, namesOverlapByContainment } from '../../../utils/nameNormalization';
import { GENERIC_PROJECT_WORDS, KNOWN_PROJECT_ALIASES, type ProjectSuggestion, type ProjectSuggestionOptions } from './projectSuggestionTypes';

const GENERIC_SUFFIXES = [
  ' project',
  ' app',
  ' website',
  ' build',
  ' feature',
  ' system',
  ' repo',
  ' initiative',
  ' product',
];

const LEADING_STOP = /^(?:the|my|our|a|an|this|that)\s+/;

export function canonicalProjectKey(name: string): string {
  let s = normalizeNameKey(name);
  const alias = KNOWN_PROJECT_ALIASES.get(s);
  if (alias) return normalizeNameKey(alias);

  for (const suffix of GENERIC_SUFFIXES) {
    if (s.endsWith(suffix)) s = s.slice(0, -suffix.length).trim();
  }

  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(LEADING_STOP, '').trim();
    for (const suffix of GENERIC_SUFFIXES) {
      if (s.endsWith(suffix)) s = s.slice(0, -suffix.length).trim();
    }
  }

  if (s.endsWith('s') && s.length > 3 && !s.endsWith('ss')) {
    s = s.slice(0, -1);
  }

  return s;
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(w => w.length > 2 && !GENERIC_PROJECT_WORDS.has(w)));
  const tb = new Set(b.split(' ').filter(w => w.length > 2 && !GENERIC_PROJECT_WORDS.has(w)));
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter(w => tb.has(w)).length;
  return inter / new Set([...ta, ...tb]).size;
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dist[i][0] = i;
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return 1 - dist[a.length][b.length] / Math.max(a.length, b.length);
}

function similarityScore(a: string, b: string): number {
  const ka = canonicalProjectKey(a);
  const kb = canonicalProjectKey(b);
  if (ka === kb) return 1;
  if (namesOverlapByContainment(a, b)) return 0.92;
  const compactA = ka.replace(/\s+/g, '');
  const compactB = kb.replace(/\s+/g, '');
  return Math.max(tokenSimilarity(ka, kb), levenshteinRatio(compactA, compactB));
}

function mergeEvidence(primary: ProjectSuggestion, secondary: ProjectSuggestion): ProjectSuggestion {
  return {
    ...primary,
    confidence: Math.max(primary.confidence, secondary.confidence),
    evidencePhrases: [...new Set([...primary.evidencePhrases, ...secondary.evidencePhrases])],
    rulesFired: [...new Set([...primary.rulesFired, ...secondary.rulesFired, 'dedupe_merged_evidence'])],
    boundaryFixes: [...new Set([...primary.boundaryFixes, ...secondary.boundaryFixes])],
  };
}

export function dedupeProjectSuggestions(
  items: ProjectSuggestion[],
  options?: ProjectSuggestionOptions
): ProjectSuggestion[] {
  const accepted = items.filter(
    s => s.status !== 'rejected' && s.status !== 'reference'
  );
  const rejected = items.filter(s => s.status === 'rejected' || s.status === 'reference');

  const withKeys = accepted.map(item => ({
    ...item,
    canonicalKey: canonicalProjectKey(item.text),
    normalizedText: normalizeNameKey(item.text),
  }));

  const byCanonical = new Map<string, ProjectSuggestion>();
  const output: ProjectSuggestion[] = [];

  for (const item of withKeys) {
    const existing = byCanonical.get(item.canonicalKey);
    if (existing) {
      byCanonical.set(item.canonicalKey, mergeEvidence(existing, item));
      continue;
    }
    byCanonical.set(item.canonicalKey, item);
  }

  const mergedList = [...byCanonical.values()];

  for (const item of mergedList) {
    let suggestion = { ...item };

    const knownId = options?.knownProjectIds?.get(item.canonicalKey);
    if (knownId || options?.knownProjects?.has(item.text)) {
      suggestion = {
        ...suggestion,
        status: 'known',
        matchedProjectId: knownId ?? suggestion.matchedProjectId,
        rulesFired: [...suggestion.rulesFired, 'known_project_canonical'],
      };
      output.push(suggestion);
      continue;
    }

    const duplicates = mergedList.filter(
      other =>
        other !== item &&
        other.canonicalKey !== item.canonicalKey &&
        similarityScore(other.text, item.text) >= 0.72
    );

    if (duplicates.length > 0) {
      const best = duplicates.sort((a, b) => similarityScore(b.text, item.text) - similarityScore(a.text, item.text))[0];
      suggestion = {
        ...suggestion,
        status: 'possible_duplicate',
        duplicateOfProjectId: best.matchedProjectId,
        mergeCandidates: [
          {
            projectId: best.matchedProjectId ?? best.canonicalKey,
            displayName: best.text,
            similarity: similarityScore(best.text, item.text),
            reason: 'similar_canonical_or_alias',
          },
        ],
        rulesFired: [...suggestion.rulesFired, 'possible_duplicate'],
      };
    }

    const descriptorParent = findDescriptorParent(suggestion, mergedList);
    if (descriptorParent && descriptorParent.canonicalKey !== suggestion.canonicalKey) {
      const parent = byCanonical.get(descriptorParent.canonicalKey);
      if (parent) {
        byCanonical.set(
          descriptorParent.canonicalKey,
          mergeEvidence(parent, {
            ...suggestion,
            rulesFired: [...suggestion.rulesFired, 'descriptor_merged_into_parent'],
          })
        );
        continue;
      }
    }

    output.push(suggestion);
  }

  const finalByCanonical = new Map<string, ProjectSuggestion>();
  for (const item of output) {
    const key = item.canonicalKey ?? canonicalProjectKey(item.text);
    const existing = finalByCanonical.get(key);
    if (!existing || item.confidence > existing.confidence) {
      finalByCanonical.set(key, { ...item, canonicalKey: key });
    }
  }

  return [...finalByCanonical.values(), ...rejected].sort((a, b) => b.confidence - a.confidence);
}

function findDescriptorParent(
  item: ProjectSuggestion,
  all: ProjectSuggestion[]
): ProjectSuggestion | undefined {
  const evidence = item.evidencePhrases.join(' ').toLowerCase();
  const cue = /\b(?:called|named)\b/i.exec(evidence);
  if (!cue) return undefined;
  if (GENERIC_PROJECT_WORDS.has(canonicalProjectKey(item.text))) return undefined;

  // The named entity follows the "called/named" cue; the descriptor precedes it.
  // If this item appears at/after the cue it is the real name — never demote it
  // into a generic descriptor parent that sits before the cue.
  const itemPos = evidence.indexOf(item.text.toLowerCase());
  if (itemPos >= 0 && itemPos >= cue.index) return undefined;

  for (const other of all) {
    if (other === item) continue;
    const key = canonicalProjectKey(other.text);
    if (key.length < 3) continue;
    if (evidence.includes(other.text.toLowerCase()) || evidence.includes(key)) {
      if (item.text.split(/\s+/).length > other.text.split(/\s+/).length) return other;
    }
  }

  for (const other of all) {
    if (other === item) continue;
    if (/^[A-Z][\w'&.-]+(-\d+)?$/.test(other.text.trim())) {
      const key = canonicalProjectKey(other.text);
      if (evidence.includes(key) && item.text.split(/\s+/).length >= 2) return other;
    }
  }

  return undefined;
}
