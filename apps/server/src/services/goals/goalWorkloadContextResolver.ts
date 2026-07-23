export function resolveWorkloadContext(input: {
  workEventsLast14Days?: number;
  journalEntriesLast14Days?: number;
}): 'LOW' | 'NORMAL' | 'HIGH' {
  if ((input.workEventsLast14Days ?? 0) >= 10 && (input.journalEntriesLast14Days ?? 0) <= 2) return 'HIGH';
  if ((input.workEventsLast14Days ?? 0) <= 1) return 'LOW';
  return 'NORMAL';
}
