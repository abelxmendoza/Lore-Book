import type { PerceptionEntry } from '../../types/perception';

const MAX_TITLE_WORDS = 6;
const MAX_TITLE_CHARACTERS = 54;
const BELIEF_LEAD = /^(?:(?:i|we)\s+)?(?:believed|believe|thought|think|felt|feel|assumed|assume|heard|suspected|suspect|worried|worry|was told)(?:\s+that)?\s+/i;
const AUXILIARY_LEAD = /^(?:was|is|were|are|had|has|seemed|seems|might|may|could|would)\s+/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanTitleText(value: string): string {
  return value
    .replace(/[*_`#]/g, '')
    .replace(/^['“”\s]+|['“”\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shorten(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  let shortened = words.slice(0, MAX_TITLE_WORDS).join(' ');

  if (shortened.length > MAX_TITLE_CHARACTERS) {
    shortened = shortened.slice(0, MAX_TITLE_CHARACTERS).replace(/\s+\S*$/, '').trim();
  }

  shortened = shortened.replace(/[,:;.!?\-–—]+$/g, '').trim();
  return shortened;
}

/**
 * One presentation title for both Perception cards and detail modals.
 * Explicit stored titles win; older rows get a conservative first-clause
 * fallback without changing the canonical belief text or its provenance.
 */
export function getPerceptionShortTitle(perception: PerceptionEntry): string {
  const metadata = perception.metadata ?? {};
  const storedTitle = [metadata.short_title, metadata.shortTitle, metadata.title]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (storedTitle) return cleanTitleText(storedTitle);

  const firstClause = perception.content.split(/[.!?\n]|\s+[;—–]\s+/)[0] ?? '';
  let candidate = cleanTitleText(firstClause).replace(BELIEF_LEAD, '').replace(/^that\s+/i, '');

  if (perception.subject_alias.trim()) {
    const subjectAtStart = new RegExp(`^${escapeRegExp(perception.subject_alias.trim())}(?:['’]s)?\\s+`, 'i');
    candidate = candidate.replace(subjectAtStart, '').replace(AUXILIARY_LEAD, '');
  }

  candidate = cleanTitleText(candidate);
  if (candidate.length < 3) return `Belief about ${perception.subject_alias || 'someone'}`;

  return shorten(candidate.charAt(0).toUpperCase() + candidate.slice(1));
}
