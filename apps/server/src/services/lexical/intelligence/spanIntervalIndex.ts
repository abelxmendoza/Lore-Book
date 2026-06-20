/** Interval index for span containment / overlap queries — O(log S + k) typical per lookup. */

export type SpanBounds = { start: number; end: number };

function bisectRightStart(
  entries: Array<{ start: number; end: number }>,
  start: number
): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid]!.start <= start) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class SpanIntervalIndex<T extends SpanBounds> {
  private readonly entries: Array<{ start: number; end: number; item: T }> = [];

  get size(): number {
    return this.entries.length;
  }

  add(item: T): void {
    const entry = { start: item.start, end: item.end, item };
    const idx = bisectRightStart(this.entries, item.start);
    this.entries.splice(idx, 0, entry);
  }

  /** Tightest container: max start among intervals fully containing [start, end). */
  findTightestContainer(start: number, end: number): T | undefined {
    let best: T | undefined;
    let bestStart = -1;

    const limit = bisectRightStart(this.entries, start);
    for (let i = limit - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.end < end) continue;
      if (e.start <= start && e.start >= bestStart) {
        bestStart = e.start;
        best = e.item;
      }
    }
    return best;
  }

  findOverlapping(
    span: SpanBounds,
    predicate: (existing: T, incoming: T) => boolean,
    incoming: T
  ): T | undefined {
    for (const e of this.entries) {
      if (e.start >= span.end) break;
      if (e.end > span.start && predicate(e.item, incoming)) return e.item;
    }
    return undefined;
  }

  remove(item: T): void {
    const idx = this.entries.findIndex((e) => e.item === item);
    if (idx >= 0) this.entries.splice(idx, 1);
  }

  values(): T[] {
    return this.entries.map((e) => e.item);
  }
}

export function spansOverlap(a: SpanBounds, b: SpanBounds): boolean {
  return a.start < b.end && b.start < a.end;
}
