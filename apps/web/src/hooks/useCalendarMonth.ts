import { useCallback, useEffect, useState } from 'react';
import { calendarMonthApi, type CalendarMonthResult } from '../api/calendarMonth';

export function useCalendarMonth(year: number, month: number, enabled = true) {
  const [data, setData] = useState<CalendarMonthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await calendarMonthApi.get(year, month);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayMap = new Map(data?.days.map(d => [d.date, d]) ?? []);

  return { data, dayMap, loading, error, reload: load };
}
