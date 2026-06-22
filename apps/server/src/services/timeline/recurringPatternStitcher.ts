import type { RecurrencePattern } from './timelineStitchingTypes';

const DAY_MAP: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function stitchRecurringPattern(
  text: string,
  activityLabel: string,
): { label: string; recurrence: RecurrencePattern } | null {
  const weeklyDay = text.match(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (weeklyDay) {
    const day = DAY_MAP[weeklyDay[1].toLowerCase()] ?? weeklyDay[1];
    return {
      label: `${day} ${activityLabel}`,
      recurrence: {
        frequency: 'weekly',
        dayOfWeek: day,
        context: activityLabel,
      },
    };
  }

  if (/\ball\s+the\s+time\b/i.test(text)) {
    return {
      label: activityLabel,
      recurrence: {
        frequency: 'irregular',
        context: 'frequent recurring activity',
      },
    };
  }

  return null;
}

export function inferActivityFromText(text: string): string | undefined {
  if (/\bband\s+practice\b/i.test(text) || /\bpracticed?\s+in\s+band\b/i.test(text)) {
    return 'Band Practice';
  }
  if (/\bwent\s+to\s+shows?\b/i.test(text)) return 'Went to Shows';
  return undefined;
}
