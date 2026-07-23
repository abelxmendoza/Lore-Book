import type { GoalDomain } from './goalTypes';

export function routeGoalDomain(text: string): GoalDomain {
  if (/\b(?:job|career|recruiter|interview|resume|robotics role)\b/i.test(text)) return 'CAREER';
  if (/\b(?:manager|work|Ring|devices?|unit|shift)\b/i.test(text)) return 'WORK';
  if (/\b(?:LoreBook|project|ship|launch|build|deploy)\b/i.test(text)) return 'PROJECT';
  if (/\b(?:debt|money|financial|budget|save)\b/i.test(text)) return 'FINANCE';
  if (/\b(?:run|workout|exercise|fitness|gym|training)\b/i.test(text)) return 'FITNESS';
  if (/\b(?:health|doctor|sleep|therapy)\b/i.test(text)) return 'HEALTH';
  if (/\b(?:learn|study|course|school|class)\b/i.test(text)) return 'EDUCATION';
  if (/\b(?:date|relationship|Ashley|reconnect|seeing)\b/i.test(text)) return 'RELATIONSHIP';
  if (/\b(?:friend|social|party|text|reply)\b/i.test(text)) return 'SOCIAL';
  if (/\b(?:family|mom|dad|parent|sibling)\b/i.test(text)) return 'FAMILY';
  if (/\b(?:write|art|music|creative)\b/i.test(text)) return 'CREATIVE';
  if (/\b(?:travel|trip|visit|Japan)\b/i.test(text)) return 'TRAVEL';
  return 'OTHER';
}
