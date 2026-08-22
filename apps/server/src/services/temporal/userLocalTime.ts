/**
 * Civil-date helpers in a user's IANA timezone.
 * Calendar day keys and month windows must not use UTC ISO prefixes.
 */
import { fromZonedTime } from 'date-fns-tz';

import { isValidIanaTimezone } from './userTimezoneService';

export function resolveProjectionTimezone(timezone?: string | null): string {
  return isValidIanaTimezone(timezone) ? timezone : 'UTC';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function civilDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** YYYY-MM-DD of `instant` in `timeZone`. */
export function localDayKey(instant: string | Date, timeZone: string): string | null {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (!Number.isFinite(date.getTime())) return null;
  const tz = resolveProjectionTimezone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) return null;
    return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function shiftCivilDate(day: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays);
  const shifted = new Date(utc);
  return civilDateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function civilDateInMonth(day: string, year: number, month: number): boolean {
  return day.startsWith(`${year}-${pad2(month)}-`);
}

export function civilRangeOverlapsMonth(
  startDay: string | null | undefined,
  endDay: string | null | undefined,
  year: number,
  month: number,
): boolean {
  const monthStart = civilDateKey(year, month, 1);
  const monthEnd = civilDateKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const start = startDay ?? endDay;
  const end = endDay ?? startDay;
  if (!start || !end) return false;
  return start <= monthEnd && end >= monthStart;
}

/**
 * Inclusive UTC instants covering the civil month in `timeZone`.
 * Wall-clock midnight is interpreted in the user zone via date-fns-tz.
 */
export function getUserLocalMonthBounds(
  year: number,
  month: number,
  timeZone: string,
): {
  startIso: string;
  endIso: string;
  startDay: string;
  endDay: string;
  queryStartDay: string;
  queryEndDay: string;
} {
  const tz = resolveProjectionTimezone(timeZone);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = civilDateKey(year, month, 1);
  const endDay = civilDateKey(year, month, lastDay);
  const start = fromZonedTime(new Date(year, month - 1, 1, 0, 0, 0, 0), tz);
  const nextMonth = fromZonedTime(new Date(year, month, 1, 0, 0, 0, 0), tz);
  const end = new Date(nextMonth.getTime() - 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDay,
    endDay,
    queryStartDay: shiftCivilDate(startDay, -1),
    queryEndDay: shiftCivilDate(endDay, 1),
  };
}
