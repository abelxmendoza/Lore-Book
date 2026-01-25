/**
 * Scope inference for temporal relationships — Phase 2.1
 * Keyword-based classification of document context: work, family, romantic, etc.
 */

export type RelationshipScope =
  | 'global'
  | 'work'
  | 'family'
  | 'romantic'
  | 'friendship'
  | 'friends'      // optional alias of friendship; validation/API only, inferScope keeps friendship
  | 'health'
  | 'stress'
  | 'creative'
  | 'transition'
  | 'spiritual';

export const RELATIONSHIP_SCOPE_SET = new Set<RelationshipScope>([
  'global',
  'work',
  'family',
  'romantic',
  'friendship',
  'friends',
  'health',
  'stress',
  'creative',
  'transition',
  'spiritual',
]);

const SCOPE_KEYWORDS: { scope: RelationshipScope; keywords: string[] }[] = [
  { scope: 'work', keywords: ['job', 'career', 'office', 'boss', 'coworker', 'meeting', 'salary', 'project', 'work', 'colleague', 'manager', 'interview', 'promotion'] },
  { scope: 'family', keywords: ['family', 'mom', 'dad', 'parent', 'sibling', 'holiday', 'thanksgiving', 'christmas', 'child', 'children', 'grandparent', 'cousin', 'aunt', 'uncle'] },
  { scope: 'romantic', keywords: ['romantic', 'dating', 'partner', 'boyfriend', 'girlfriend', 'husband', 'wife', 'marriage', 'love', 'ex', 'divorce', 'engagement'] },
  { scope: 'friendship', keywords: ['friend', 'friends', 'hang out', 'coffee', 'beer', 'lunch', 'gathering', 'party'] },
  { scope: 'health', keywords: ['health', 'doctor', 'hospital', 'therapy', 'medication', 'exercise', 'sleep', 'mental health', 'diagnosis', 'treatment'] },
  { scope: 'stress', keywords: ['stress', 'stressed', 'anxiety', 'overwhelmed', 'crisis', 'panic', 'breakdown', 'burnout'] },
  { scope: 'creative', keywords: ['creative', 'writing', 'art', 'music', 'design', 'painting', 'novel', 'project'] },
  { scope: 'transition', keywords: ['transition', 'moved', 'new job', 'graduated', 'divorced', 'relocated', 'left', 'started', 'ended'] },
  { scope: 'spiritual', keywords: ['spiritual', 'meditation', 'faith', 'church', 'prayer', 'mindfulness', 'religion'] },
];

/**
 * Infer document-level scope from text. Keyword-based; first match wins. No LLM.
 */
export function inferScope(text: string): RelationshipScope {
  const lower = text.toLowerCase().trim();
  if (!lower) return 'global';

  for (const { scope, keywords } of SCOPE_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return scope;
    }
  }
  return 'global';
}
