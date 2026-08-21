import type { CalendarDay, CalendarMonthResult } from '../api/calendarMonth';
import { buildMockStitchedTimeline } from './stitchedTimelineMock';

/** Demo calendar month projected from the mock stitched timeline. */
export function buildMockCalendarMonth(year: number, month: number): CalendarMonthResult {
  const stitched = buildMockStitchedTimeline();
  const daysMap = new Map<string, CalendarDay>();

  const ensureDay = (date: string): CalendarDay => {
    let day = daysMap.get(date);
    if (!day) {
      day = {
        date,
        occasions: [],
        items: [],
        attendedCount: 0,
        heardAboutCount: 0,
        concurrentOccasions: 0,
      };
      daysMap.set(date, day);
    }
    return day;
  };

  for (const item of stitched.items) {
    const date = item.sortTime.slice(0, 10);
    const [y, m] = date.split('-').map(Number);
    if (y !== year || m !== month) continue;
    const day = ensureDay(date);
    day.items.push({
      id: item.id,
      kind: item.kind === 'event' || item.kind === 'moment' ? item.kind : 'moment',
      title: item.title,
      sortTime: item.sortTime,
      userPresence: item.userPresence ?? 'attended',
      body: item.body || undefined,
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      sourceIds: item.sourceIds,
      sourceType: item.sourceType,
      tags: item.tags,
    });
    if ((item.userPresence ?? 'attended') === 'attended') day.attendedCount += 1;
    else if (item.userPresence === 'heard_about') day.heardAboutCount += 1;
  }

  // Seed a synthetic occasion in the middle of the month when empty, so demo
  // users can still exercise the occasion → chronology path.
  if (daysMap.size === 0) {
    const date = `${year}-${String(month).padStart(2, '0')}-15`;
    const day = ensureDay(date);
    day.occasions.push({
      id: 'demo-occasion-midmonth',
      title: 'Demo gathering',
      summary: 'A sample occasion from demo lore.',
      userPresence: 'attended',
      itemCount: 1,
    });
    day.concurrentOccasions = 1;
    day.items.push({
      id: 'occasion:demo-occasion-midmonth',
      kind: 'occasion',
      title: 'Demo gathering',
      sortTime: `${date}T18:00:00.000Z`,
      userPresence: 'attended',
      lifeArcId: 'demo-occasion-midmonth',
      body: 'A sample occasion from demo lore.',
    });
    day.attendedCount = 1;
  }

  return {
    year,
    month,
    days: [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    unscheduledItems: [],
  };
}
