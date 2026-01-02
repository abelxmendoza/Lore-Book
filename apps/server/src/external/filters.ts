import { ExternalEvent } from './types';

export function filterNoise(events: ExternalEvent[]): ExternalEvent[] {
  return events.filter((event) => {
    if (event.type === 'milestone' || event.type === 'story_highlight') {
      return true;
    }

    if (typeof event.text === 'string' && event.text.trim().length > 0) {
      return true;
    }

    return false;
  });
}
