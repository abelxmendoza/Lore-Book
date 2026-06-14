/** Sort timeline events by date (invalid dates sink to the end). */
export function sortTimelineEventsChronologically<T extends { eventDate: string }>(
  events: T[],
  order: 'asc' | 'desc' = 'asc',
): T[] {
  return [...events].sort((a, b) => {
    const ta = new Date(a.eventDate).getTime();
    const tb = new Date(b.eventDate).getTime();
    const aValid = !Number.isNaN(ta);
    const bValid = !Number.isNaN(tb);
    if (!aValid && !bValid) return 0;
    if (!aValid) return 1;
    if (!bValid) return -1;
    return order === 'asc' ? ta - tb : tb - ta;
  });
}
