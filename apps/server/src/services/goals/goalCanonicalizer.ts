import type { GoalKind } from './goalTypes';

const LEADING_INTENT = /^(?:I\s+)?(?:still\s+)?(?:want|need|plan|hope|wish|intend|am trying|I'm trying|am going|I'm going)\s+to\s+/i;

export function canonicalizeGoalTitle(raw: string, kind: GoalKind): string {
  let title = raw.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  const nested = /\b(?:don'?t|do not)\s+want\s+to\s+stop\s+(.+)/i.exec(title);
  if (nested) title = `Continue ${nested[1]}`;
  title = title.replace(LEADING_INTENT, '');
  title = title.replace(/^(?:my goal is to|please)\s+/i, '');
  if (kind === 'AVOIDANCE_GOAL') {
    title = title.replace(/^(?:I\s+)?(?:don'?t|do not|never)\s+want\s+to\s+/i, 'Avoid ');
    if (!/^avoid\b/i.test(title)) title = `Avoid ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
  }
  const words = title.split(/\s+/).filter(Boolean).slice(0, 12);
  title = words.join(' ');
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : '';
}

export function isSemanticallyCompleteGoalTitle(title: string): boolean {
  const words = title.split(/\s+/).filter(Boolean);
  const compactAction =
    words.length === 2 &&
    /^(?:launch|ship|build|find|finish|complete|improve|continue|avoid|reply|move|save|learn)\b/i.test(title);
  if ((!compactAction && words.length < 3) || words.length > 12) return false;
  if (/^(?:next|you completely|that was a|failed response|run by)\b/i.test(title)) return false;
  if (/\b(?:and|or|to|with|because|after|before)$/.test(title.toLowerCase())) return false;
  if (/^(?:it|this|that|they|he|she)\b/i.test(title)) return false;
  return /[a-z]/i.test(title);
}
