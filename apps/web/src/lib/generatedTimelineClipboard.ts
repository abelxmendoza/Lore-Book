import { buildListClipboardText, clipboardFilterLines } from './listClipboard';

/** Minimal event shape for Universal Timeline Search output copy. */
export type GeneratedTimelineClipboardEvent = {
  id: string;
  start_time: string;
  content: string;
  title?: string;
  timeline_names?: string[];
  tags?: string[];
  stateChange?: string;
  significance?: string;
};

function formatEventDate(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return 'Undated';
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function buildGeneratedTimelineClipboardText(
  query: string,
  events: GeneratedTimelineClipboardEvent[],
  options?: {
    filters?: string[];
    isMock?: boolean;
    fromLibrary?: boolean;
  },
): string {
  const sorted = [...events].sort((a, b) => {
    const at = new Date(a.start_time).getTime();
    const bt = new Date(b.start_time).getTime();
    return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
  });

  return buildListClipboardText({
    title: `Universal Timeline Search — ${query}`,
    filters: clipboardFilterLines([
      ...(options?.filters ?? []),
      options?.isMock && 'simulated preview',
      options?.fromLibrary && 'from library',
    ]),
    items: sorted.map((event) => ({
      heading: event.title?.trim() || formatEventDate(event.start_time),
      fields: [
        { label: 'Date', value: formatEventDate(event.start_time) },
        { label: 'Lanes', value: event.timeline_names },
        { label: 'Tags', value: event.tags },
        { label: 'State change', value: event.stateChange },
        { label: 'Significance', value: event.significance },
      ],
      body: event.content,
    })),
  });
}
