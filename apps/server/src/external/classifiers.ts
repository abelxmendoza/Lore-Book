import { ExternalEvent } from './types';

const milestoneKeywords = ['shipped', 'launch', 'released', 'milestone', 'highlight'];

export function detectMilestone(event: ExternalEvent): string | null {
  if (typeof event.milestone === 'string' && event.milestone.length > 0) {
    return event.milestone;
  }

  if (event.type === 'milestone' || event.type === 'story_highlight' || event.type === 'release') {
    return event.type;
  }

  const text = event.text?.toLowerCase() ?? '';
  const keyword = milestoneKeywords.find((keyword) => text.includes(keyword));
  return keyword ?? null;
}

export function classifyMilestones(events: ExternalEvent[]): ExternalEvent[] {
  return events
    .map((event) => ({ ...event, milestone: detectMilestone(event) }))
    .filter((event) => event.milestone !== null);
}
