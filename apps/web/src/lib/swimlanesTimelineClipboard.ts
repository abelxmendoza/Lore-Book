/**
 * Plain-text export of the Omni swimlanes canvas — what is drawn, where, and why.
 * Nested arcs/children and full moment text are included for human + LLM audits.
 */

import type { ArcTrack, LifeArc } from '../hooks/useLifeArcs';
import { TRACK_LABELS } from '../hooks/useLifeArcs';
import type { ChronologyEntry } from '../types/timelineV2';
import type { EntryCluster, KnowledgeGap, SubLaneMap } from '../components/timeline/swimlaneOverlap';
import type { TimelineZoomScaleId } from '../components/timeline/timelineZoomScale';
import { getSwimlaneArcBarEligibility } from '../components/timeline/timelineRangeAuthority';
import type { StitchedTimelineItem } from '../api/stitchedTimeline';
import { formatClipboardFields } from './listClipboard';

const DAY_MS = 86_400_000;
const INDENT = '  ';

export type SwimlanesClipboardEra = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

export type SwimlanesClipboardSnapshot = {
  scaleId: TimelineZoomScaleId;
  scaleLabel: string;
  zoom: number;
  pixelsPerDay: number;
  timelineStartIso: string;
  todayIso: string;
  totalDays: number;
  totalWidthPx: number;
  clusterPx: number;
  showEraBands: boolean;
  eras: SwimlanesClipboardEra[];
  tracks: ArcTrack[];
  /** Flat + nested arcs as loaded (children / parent_id). */
  arcs: LifeArc[];
  /** All loaded top-level arcs grouped by their assigned track. */
  arcsByTrack: Partial<Record<ArcTrack, LifeArc[]>>;
  /** The subset that passed the shared bar-eligibility rule and is rendered. */
  drawableArcsByTrack: Partial<Record<ArcTrack, LifeArc[]>>;
  subLaneByTrack: Partial<Record<ArcTrack, SubLaneMap>>;
  gapsByTrack: Partial<Record<ArcTrack, KnowledgeGap[]>>;
  entries: ChronologyEntry[];
  clusters: EntryCluster[];
  unresolvedItems: StitchedTimelineItem[];
  viewportScrollLeftPx: number;
  viewportWidthPx: number;
  /** Pixel x for a date (same math as the canvas). */
  xOf: (date: Date | string) => number;
};

function isoDay(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function daysBetweenIso(
  start: string | null | undefined,
  end: string | null | undefined,
  fallbackEnd: string,
): number {
  if (!start) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end || fallbackEnd).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

function pad(depth: number): string {
  return INDENT.repeat(depth);
}

function line(depth: number, text: string): string {
  return `${pad(depth)}${text}`;
}

function fieldLines(
  depth: number,
  fields: Array<{ label: string; value?: string | number | boolean | null | string[] }>,
): string[] {
  const formatted = formatClipboardFields(fields);
  if (!formatted) return [];
  return formatted.split('\n').map((l) => line(depth, l));
}

function wrapBody(depth: number, label: string, body: string, max = 2_000): string[] {
  const text = body.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const clipped = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const bodyLines = clipped.split('\n');
  if (bodyLines.length === 1) return [line(depth, `${label}: ${bodyLines[0]}`)];
  return [line(depth, `${label}:`), ...bodyLines.map((l) => line(depth + 1, l || ' '))];
}

function metaObjectLines(depth: number, meta: Record<string, unknown> | undefined): string[] {
  if (!meta || Object.keys(meta).length === 0) return [];
  const lines = [line(depth, 'Metadata:')];
  for (const [key, value] of Object.entries(meta)) {
    if (value == null || value === '') continue;
    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value);
        const short = json.length > 240 ? `${json.slice(0, 239)}…` : json;
        lines.push(line(depth + 1, `${key}: ${short}`));
      } catch {
        lines.push(line(depth + 1, `${key}: [object]`));
      }
    } else {
      lines.push(line(depth + 1, `${key}: ${String(value)}`));
    }
  }
  return lines.length > 1 ? lines : [];
}

function entrySnippet(entry: ChronologyEntry, max = 120): string {
  const raw = (entry.title || entry.content || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '(no text)';
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

type DiagnosticSeverity = 'ERROR' | 'WARNING' | 'INFO';

type SwimlanesDiagnostic = {
  severity: DiagnosticSeverity;
  code: string;
  subject: string;
  detail: string;
  correction?: string;
};

const EXPECTED_SUPPRESSION_REASONS = new Set(['occasion', 'explicitly_suppressed', 'single_day_span']);

function collectArcOccurrences(arcs: LifeArc[]): Map<string, number> {
  const counts = new Map<string, number>();
  const visitedObjects = new WeakSet<object>();
  const visit = (list: LifeArc[]) => {
    for (const arc of list) {
      counts.set(arc.id, (counts.get(arc.id) ?? 0) + 1);
      if (visitedObjects.has(arc)) continue;
      visitedObjects.add(arc);
      if (arc.children?.length) visit(arc.children);
    }
  };
  visit(arcs);
  return counts;
}

/** Produce actionable, privacy-safe structural findings for the copied dump. */
export function diagnoseSwimlanesSnapshot(snap: SwimlanesClipboardSnapshot): SwimlanesDiagnostic[] {
  const findings: SwimlanesDiagnostic[] = [];
  const sourceArcs = snap.arcs.length > 0
    ? snap.arcs
    : Object.values(snap.arcsByTrack).flatMap((items) => items ?? []);
  const flatArcs = flattenLifeArcs(sourceArcs);
  const arcIds = new Set(flatArcs.map((arc) => arc.id));
  const arcById = new Map(flatArcs.map((arc) => [arc.id, arc]));
  const drawableIds = new Set(
    Object.values(snap.drawableArcsByTrack).flatMap((items) => items ?? []).map((arc) => arc.id),
  );

  for (const [id, count] of collectArcOccurrences(sourceArcs)) {
    if (count > 1) {
      findings.push({
        severity: 'ERROR', code: 'DUPLICATE_ARC_ID', subject: `arc ${id}`,
        detail: `The canonical arc tree contains this id ${count} times.`,
        correction: 'Merge or remove duplicate records while preserving the strongest provenance.',
      });
    }
  }

  const reportedCycles = new Set<string>();
  for (const arc of flatArcs) {
    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let cursor: LifeArc | undefined = arc;
    while (cursor) {
      const cycleStart = pathIndexes.get(cursor.id);
      if (cycleStart != null) {
        const cycle = path.slice(cycleStart).concat(cursor.id);
        const cycleKey = [...new Set(cycle)].sort().join('|');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          findings.push({
            severity: 'ERROR', code: 'ARC_PARENT_CYCLE', subject: cycle.join(' → '),
            detail: 'The parent chain forms a cycle, so the arc tree cannot be represented reliably.',
            correction: 'Remove the incorrect parent_id link that closes the cycle.',
          });
        }
        break;
      }
      pathIndexes.set(cursor.id, path.length);
      path.push(cursor.id);
      cursor = cursor.parent_id ? arcById.get(cursor.parent_id) : undefined;
    }
  }

  for (const arc of flatArcs) {
    const title = arc.title?.trim();
    const assignedTrack = arc.track ?? 'inner';
    const eligibility = getSwimlaneArcBarEligibility(arc);
    const listedTracks = snap.tracks.filter((track) =>
      (snap.arcsByTrack[track] ?? []).some((candidate) => candidate.id === arc.id),
    );
    const isTopLevelCandidate = !arc.parent_id || listedTracks.length > 0;

    if (!title) {
      findings.push({
        severity: 'ERROR', code: 'UNTITLED_ARC', subject: `arc ${arc.id}`,
        detail: 'This arc has no readable title.', correction: 'Add a concise evidence-backed arc title.',
      });
    }
    if (arc.parent_id && !arcIds.has(arc.parent_id)) {
      findings.push({
        severity: 'ERROR', code: 'MISSING_PARENT', subject: title || `arc ${arc.id}`,
        detail: `parent_id ${arc.parent_id} does not exist in the loaded arc set.`,
        correction: 'Clear the stale parent_id or restore/link the intended parent arc.',
      });
    }
    if (arc.parent_id === arc.id) {
      findings.push({
        severity: 'ERROR', code: 'SELF_PARENT', subject: title || `arc ${arc.id}`,
        detail: 'The arc points to itself as its parent.', correction: 'Clear parent_id or select a different parent.',
      });
    }
    if (isTopLevelCandidate && listedTracks.length === 0) {
      findings.push({
        severity: 'ERROR', code: 'ARC_NOT_GROUPED', subject: title || `arc ${arc.id}`,
        detail: `The arc is assigned to ${assignedTrack} but is absent from arcsByTrack.`,
        correction: 'Rebuild the track grouping from the canonical arc list.',
      });
    } else if (isTopLevelCandidate && !listedTracks.includes(assignedTrack)) {
      findings.push({
        severity: 'ERROR', code: 'TRACK_MISMATCH', subject: title || `arc ${arc.id}`,
        detail: `Arc track is ${assignedTrack}, but it was grouped under ${listedTracks.join(', ')}.`,
        correction: 'Group the arc under its canonical track or correct the track value.',
      });
    }

    if (isTopLevelCandidate && eligibility.drawable && !drawableIds.has(arc.id)) {
      findings.push({
        severity: 'ERROR', code: 'DRAWABLE_ARC_MISSING_BAR', subject: title || `arc ${arc.id}`,
        detail: 'The shared eligibility rule says this arc is drawable, but no bar was rendered.',
        correction: 'Check track grouping, filtering, and sub-lane layout for this arc id.',
      });
    } else if (isTopLevelCandidate && !eligibility.drawable && drawableIds.has(arc.id)) {
      findings.push({
        severity: 'ERROR', code: 'SUPPRESSED_ARC_DRAWN', subject: title || `arc ${arc.id}`,
        detail: `A bar was rendered despite suppression reason: ${eligibility.reason ?? 'unknown'}.`,
        correction: 'Use the shared bar-eligibility result when building drawable tracks.',
      });
    } else if (isTopLevelCandidate && !eligibility.drawable) {
      const expected = EXPECTED_SUPPRESSION_REASONS.has(eligibility.reason ?? '');
      findings.push({
        severity: expected ? 'INFO' : 'WARNING',
        code: `BAR_SUPPRESSED_${String(eligibility.reason ?? 'unknown').toUpperCase()}`,
        subject: title || `arc ${arc.id}`,
        detail: `No duration bar is drawn because: ${eligibility.reason ?? 'unknown reason'}.`,
        correction: expected
          ? 'Expected behavior; keep it as a dot/occasion or remove explicit suppression if a duration bar is intended.'
          : 'Correct the dates/evidence, then rebuild arc proposals.',
      });
    }

    if (arc.is_active && arc.end_date) {
      findings.push({
        severity: 'WARNING', code: 'ACTIVE_ARC_HAS_END', subject: title || `arc ${arc.id}`,
        detail: `The arc is active but has end_date ${isoDay(arc.end_date)}.`,
        correction: 'Either clear end_date or mark the arc inactive.',
      });
    }
  }

  const entryCounts = new Map<string, number>();
  const clusteredCounts = new Map<string, number>();
  for (const cluster of snap.clusters) {
    for (const entry of cluster.entries) {
      clusteredCounts.set(entry.id, (clusteredCounts.get(entry.id) ?? 0) + 1);
    }
  }
  for (const entry of snap.entries) {
    entryCounts.set(entry.id, (entryCounts.get(entry.id) ?? 0) + 1);
    const time = new Date(entry.start_time).getTime();
    const subject = entry.title?.trim() || entrySnippet(entry, 60);
    if (!Number.isFinite(time)) {
      findings.push({
        severity: 'ERROR', code: 'INVALID_MOMENT_DATE', subject,
        detail: `start_time is not a valid date: ${String(entry.start_time)}`,
        correction: 'Correct or resolve the canonical occurrence date.',
      });
    }
    if (!entry.source_id && !entry.journal_entry_id) {
      findings.push({
        severity: 'WARNING', code: 'MISSING_MOMENT_PROVENANCE', subject,
        detail: 'No source_id or journal_entry_id is available for this moment.',
        correction: 'Relink the moment to its canonical source record before editing it.',
      });
    }
    const clusterCount = clusteredCounts.get(entry.id) ?? 0;
    if (clusterCount === 0) {
      findings.push({
        severity: 'ERROR', code: 'MOMENT_NOT_CLUSTERED', subject,
        detail: 'The moment is loaded but absent from the rendered marker clusters.',
        correction: 'Re-run marker clustering and inspect invalid x/date calculations.',
      });
    } else if (clusterCount > 1) {
      findings.push({
        severity: 'ERROR', code: 'MOMENT_CLUSTERED_MULTIPLE_TIMES', subject,
        detail: `The moment appears in ${clusterCount} rendered clusters.`,
        correction: 'Deduplicate cluster membership by canonical moment id.',
      });
    }
  }
  for (const [id, count] of entryCounts) {
    if (count > 1) {
      findings.push({
        severity: 'ERROR', code: 'DUPLICATE_MOMENT_ID', subject: `moment ${id}`,
        detail: `The loaded chronology contains this id ${count} times.`,
        correction: 'Deduplicate the stitched chronology response by canonical id.',
      });
    }
  }

  for (const item of snap.unresolvedItems) {
    findings.push({
      severity: 'WARNING', code: 'UNRESOLVED_TIMELINE_DATE', subject: item.title || item.id,
      detail: `This ${item.kind} cannot be placed on the wall-calendar axis (${item.temporal?.occurred.expression || item.sortTime || 'no usable date expression'}).`,
      correction: 'Review the supporting source and assign an occurrence date/range, or leave it explicitly unresolved.',
    });
  }

  return findings;
}

/** Flatten arcs including nested `children`, deduped by id. */
export function flattenLifeArcs(arcs: LifeArc[]): LifeArc[] {
  const out: LifeArc[] = [];
  const seen = new Set<string>();
  const walk = (list: LifeArc[]) => {
    for (const arc of list) {
      if (seen.has(arc.id)) continue;
      seen.add(arc.id);
      out.push(arc);
      if (arc.children?.length) walk(arc.children);
    }
  };
  walk(arcs);
  return out;
}

/**
 * Build a forest from parent_id + embedded children.
 * Roots = no parent, or parent missing from the set.
 */
export function buildArcForest(arcs: LifeArc[]): LifeArc[] {
  const flat = flattenLifeArcs(arcs);
  const byId = new Map(flat.map((a) => [a.id, { ...a, children: [] as LifeArc[] }]));

  for (const src of flat) {
    const node = byId.get(src.id)!;
    if (src.children?.length) {
      for (const child of src.children) {
        const childNode = byId.get(child.id);
        if (childNode && !node.children!.some((c) => c.id === childNode.id)) {
          node.children!.push(childNode);
        }
      }
    }
  }

  for (const src of flat) {
    if (!src.parent_id) continue;
    const parent = byId.get(src.parent_id);
    const node = byId.get(src.id);
    if (!parent || !node) continue;
    if (!parent.children!.some((c) => c.id === node.id)) {
      parent.children!.push(node);
    }
  }

  const childIds = new Set<string>();
  for (const node of byId.values()) {
    for (const c of node.children ?? []) childIds.add(c.id);
  }

  const roots = [...byId.values()].filter((n) => !childIds.has(n.id));
  const sortByStart = (a: LifeArc, b: LifeArc) => {
    const as = a.start_date ? new Date(a.start_date).getTime() : 0;
    const bs = b.start_date ? new Date(b.start_date).getTime() : 0;
    return as - bs;
  };
  const sortTree = (nodes: LifeArc[]) => {
    nodes.sort(sortByStart);
    for (const n of nodes) {
      if (n.children?.length) sortTree(n.children);
    }
  };
  sortTree(roots);
  return roots;
}

function entryInArcRange(entry: ChronologyEntry, arc: LifeArc, todayIso: string): boolean {
  if (!arc.start_date) return false;
  const t = new Date(entry.start_time).getTime();
  const s = new Date(arc.start_date).getTime();
  const e = new Date(arc.end_date || todayIso).getTime();
  return Number.isFinite(t) && t >= s && t <= e;
}

/**
 * Architecture legend — how swimlanes maps lore onto the canvas.
 * Included in every export so audits stay self-explanatory.
 */
export const SWIMLANES_ARCHITECTURE_LEGEND = [
  '## How to read this export',
  'This dump mirrors the Omni Swimlanes canvas (what is drawn + nested data under each bar).',
  '',
  '### Display model',
  '- X axis = linear wall calendar: pixel_x ≈ days_from_timeline_start × pixels_per_day.',
  '- Rows = fixed life TRACKS (Career, Love, Relationships, Creative, Health, Inner, Mixed, Custom).',
  '  These are domain buckets — NOT Saga storylines / chapters.',
  '- Bars = life_arcs placed by start_date → end_date (ongoing arcs end at today).',
  '  Overlapping bars on one track stack into sub-lanes (0 = top).',
  '- Nested arcs = parent → child life_arcs (children[] / parent_id). Nested items may not',
  '  each get their own bar if the canvas only draws top-level track members — they are still listed here.',
  '- Dots = chronology/memory moments at start_time; nearby markers merge into clusters by pixel proximity.',
  '- Era bands (Year+ scales) = life-stage chapter candidates as full-height backgrounds.',
  '- Knowledge gaps = calendar silence between arcs on the same track (not “missing memories”).',
  '- Saga Era → Chapter → Storyline is a separate /saga reading mode and is NOT drawn on this canvas yet.',
  '',
  '### Nesting conventions in this text',
  '- Indentation = tree depth (2 spaces per level).',
  '- [ARC] = life arc bar / thread segment.',
  '- [CHILD] = nested arc under a parent.',
  '- [MOMENT] = memory/event (full text). Nested under overlapping arcs when dates fit; also listed chronologically.',
  '- [CLUSTER] = multiple moments drawn as one marker at the current zoom.',
  '- [ERA] = life-stage background band.',
].join('\n');

function formatMomentLines(
  entry: ChronologyEntry,
  depth: number,
  indexLabel: string,
  snap: SwimlanesClipboardSnapshot,
): string[] {
  const title = entry.title?.trim();
  const heading = title || entrySnippet(entry, 80);
  return [
    line(depth, `${indexLabel} [MOMENT] ${isoDay(entry.start_time)} — ${heading}`),
    ...fieldLines(depth + 1, [
      { label: 'Id', value: entry.id },
      { label: 'Start', value: entry.start_time },
      { label: 'End', value: entry.end_time },
      { label: 'Canvas x px', value: snap.xOf(entry.start_time) },
      { label: 'Precision', value: entry.time_precision },
      { label: 'Time confidence', value: entry.time_confidence },
      { label: 'Source kind', value: entry.source_kind ?? 'journal_entry' },
      { label: 'Source id', value: entry.source_id ?? entry.journal_entry_id },
      { label: 'Source type', value: entry.source_type },
      { label: 'Presence', value: entry.user_presence },
      { label: 'Temporal role', value: entry.temporal_role },
      { label: 'Timelines', value: entry.timeline_names ?? entry.timeline_memberships },
      { label: 'Tags', value: entry.tags },
    ]),
    ...wrapBody(depth + 1, 'Content', entry.content ?? ''),
  ];
}

function formatArcBlock(
  arc: LifeArc,
  opts: {
    depth: number;
    indexLabel: string;
    role: 'ARC' | 'CHILD';
    snap: SwimlanesClipboardSnapshot;
    laneMap?: SubLaneMap;
    /** Attach overlapping moments under this node (use [] for structure-only trees). */
    moments: ChronologyEntry[];
  },
): string[] {
  const { depth, indexLabel, role, snap, laneMap, moments } = opts;
  const start = arc.start_date;
  const end = arc.end_date;
  const x = start ? snap.xOf(start) : 0;
  const endX = snap.xOf(end || snap.todayIso);
  const width = Math.max(0, endX - x);
  const days = daysBetweenIso(start, end, snap.todayIso);
  const subLane = laneMap?.get(arc.id);
  const title = arc.title?.trim() || '(untitled arc)';
  const drawnOnCanvas = Object.values(snap.drawableArcsByTrack)
    .some((items) => (items ?? []).some((candidate) => candidate.id === arc.id));

  const lines: string[] = [
    line(depth, `${indexLabel} [${role}] ${title}`),
    ...fieldLines(depth + 1, [
      { label: 'Id', value: arc.id },
      { label: 'Parent id', value: arc.parent_id },
      { label: 'Type', value: arc.arc_type },
      { label: 'Track', value: arc.track },
      { label: 'Start', value: isoDay(start) },
      { label: 'End', value: end ? isoDay(end) : 'ongoing → today' },
      { label: 'Days (wall)', value: days },
      { label: 'Canvas x px', value: x },
      { label: 'Canvas width px', value: Math.round(width) },
      {
        label: 'Sub-lane',
        value:
          subLane != null
            ? subLane
            : drawnOnCanvas
              ? 0
              : 'not drawn as own bar (nested under parent)',
      },
      { label: 'Active', value: arc.is_active },
      { label: 'Confidence', value: arc.confidence },
      { label: 'Source', value: arc.source },
      { label: 'Emotion', value: arc.dominant_emotion },
      { label: 'Emotional arc', value: arc.emotional_arc },
      { label: 'Tags', value: arc.tags },
      { label: 'Children count', value: arc.children?.length ?? 0 },
    ]),
    ...wrapBody(depth + 1, 'Summary', arc.summary ?? ''),
    ...metaObjectLines(depth + 1, arc.metadata),
  ];

  const nestedMoments = moments
    .filter((e) => entryInArcRange(e, arc, snap.todayIso))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  if (nestedMoments.length > 0) {
    lines.push(line(depth + 1, `Moments overlapping this arc (${nestedMoments.length}):`));
    nestedMoments.forEach((e, i) => {
      lines.push(...formatMomentLines(e, depth + 2, `${i + 1}.`, snap));
    });
  }

  const children = arc.children ?? [];
  if (children.length > 0) {
    lines.push(line(depth + 1, `Nested children (${children.length}):`));
    children.forEach((child, i) => {
      lines.push(
        ...formatArcBlock(child, {
          depth: depth + 2,
          indexLabel: `${i + 1}.`,
          role: 'CHILD',
          snap,
          laneMap,
          moments,
        }),
      );
    });
  }

  return lines;
}

export function buildSwimlanesTimelineClipboardText(snap: SwimlanesClipboardSnapshot): string {
  const sourceArcs =
    snap.arcs.length > 0
      ? snap.arcs
      : Object.values(snap.arcsByTrack).flatMap((a) => a ?? []);
  const forest = buildArcForest(sourceArcs);
  const flatCount = flattenLifeArcs(sourceArcs).length;
  const topLevelLoaded = Object.values(snap.arcsByTrack).reduce((n, a) => n + (a?.length ?? 0), 0);
  const topLevelDrawn = Object.values(snap.drawableArcsByTrack).reduce((n, a) => n + (a?.length ?? 0), 0);
  const diagnostics = diagnoseSwimlanesSnapshot(snap);
  const diagnosticCounts = diagnostics.reduce<Record<DiagnosticSeverity, number>>(
    (counts, finding) => ({ ...counts, [finding.severity]: counts[finding.severity] + 1 }),
    { ERROR: 0, WARNING: 0, INFO: 0 },
  );
  const timelineStartMs = new Date(snap.timelineStartIso).getTime();
  const viewportStart = new Date(timelineStartMs + (snap.viewportScrollLeftPx / snap.pixelsPerDay) * DAY_MS);
  const viewportEnd = new Date(timelineStartMs + ((snap.viewportScrollLeftPx + snap.viewportWidthPx) / snap.pixelsPerDay) * DAY_MS);

  const canvasState = [
    '## Canvas state',
    formatClipboardFields([
      { label: 'Scale', value: `${snap.scaleLabel} (${snap.scaleId})` },
      { label: 'Zoom', value: `${snap.zoom.toFixed(2)}×` },
      { label: 'Pixels per day', value: snap.pixelsPerDay.toFixed(3) },
      { label: 'Timeline start', value: snap.timelineStartIso.slice(0, 10) },
      { label: 'Today', value: snap.todayIso.slice(0, 10) },
      { label: 'Canvas days', value: snap.totalDays },
      { label: 'Canvas width px', value: snap.totalWidthPx },
      { label: 'Cluster threshold px', value: snap.clusterPx },
      { label: 'Era bands visible', value: snap.showEraBands },
      { label: 'Tracks shown', value: snap.tracks.map((t) => TRACK_LABELS[t] ?? t).join(', ') },
      { label: 'Top-level arcs loaded', value: topLevelLoaded },
      { label: 'Top-level arcs drawn as bars', value: topLevelDrawn },
      { label: 'Top-level arcs not drawn', value: Math.max(0, topLevelLoaded - topLevelDrawn) },
      { label: 'Arcs including nested', value: flatCount },
      { label: 'Moments', value: snap.entries.length },
      { label: 'Moment clusters drawn', value: snap.clusters.length },
      { label: 'Temporally unresolved items', value: snap.unresolvedItems.length },
      { label: 'Eras provided', value: snap.eras.length },
      { label: 'Viewport scroll left px', value: Math.round(snap.viewportScrollLeftPx) },
      { label: 'Viewport width px', value: Math.round(snap.viewportWidthPx) },
      { label: 'Viewport starts near', value: isoDay(viewportStart) },
      { label: 'Viewport ends near', value: isoDay(viewportEnd) },
    ]),
  ].join('\n');

  const diagnosticsSection = [
    '## Diagnostics',
    `Health: ${diagnosticCounts.ERROR === 0 ? 'no structural errors detected' : `${diagnosticCounts.ERROR} error(s) detected`} · ${diagnosticCounts.WARNING} warning(s) · ${diagnosticCounts.INFO} expected suppression(s)`,
    'Diagnostics are read-only. Correction hints describe the safest next inspection; this export does not mutate lore.',
    diagnostics.length === 0
      ? '(No findings.)'
      : diagnostics.map((finding, index) => [
          `${index + 1}. [${finding.severity}] ${finding.code} — ${finding.subject}`,
          line(1, `Detail: ${finding.detail}`),
          ...(finding.correction ? [line(1, `Correction: ${finding.correction}`)] : []),
        ].join('\n')).join('\n\n'),
  ].join('\n');

  const eraSection = [
    '## 1. Era bands (life-stage backgrounds)',
    snap.eras.length === 0
      ? '(none provided)'
      : snap.eras
          .map((era, i) => {
            const x = snap.xOf(era.startDate);
            const w = Math.max(0, snap.xOf(era.endDate) - x);
            return [
              `${i + 1}. [ERA] ${era.label}`,
              ...fieldLines(1, [
                { label: 'Id', value: era.id },
                { label: 'Start', value: isoDay(era.startDate) },
                { label: 'End', value: isoDay(era.endDate) },
                { label: 'Canvas x px', value: x },
                { label: 'Canvas width px', value: w },
                { label: 'Drawn now', value: snap.showEraBands },
              ]),
            ].join('\n');
          })
          .join('\n\n'),
  ].join('\n');

  const trackSections = snap.tracks.map((track) => {
    const trackArcs = snap.drawableArcsByTrack[track] ?? [];
    const loadedTrackArcs = snap.arcsByTrack[track] ?? [];
    const roots = buildArcForest(trackArcs);
    const laneMap = snap.subLaneByTrack[track];
    const gaps = snap.gapsByTrack[track] ?? [];
    const label = TRACK_LABELS[track] ?? track;
    const nestedCount = flattenLifeArcs(trackArcs).length;

    if (trackArcs.length === 0 && gaps.length === 0) {
      return `### Track: ${label} (\`${track}\`)\n(empty — no arcs)`;
    }

    const blocks: string[] = [
      `### Track: ${label} (\`${track}\`)`,
      `Loaded top-level arcs: ${loadedTrackArcs.length} · Drawn bars: ${trackArcs.length} · Nodes under drawn bars: ${nestedCount} · Gaps: ${gaps.length}`,
    ];

    roots.forEach((arc, i) => {
      blocks.push(
        formatArcBlock(arc, {
          depth: 0,
          indexLabel: `${i + 1}.`,
          role: 'ARC',
          snap,
          laneMap,
          moments: snap.entries,
        }).join('\n'),
      );
    });

    if (gaps.length > 0) {
      blocks.push(
        [
          'Knowledge gaps (silence between arcs on this track):',
          ...gaps.map((g, i) => {
            const x = snap.xOf(new Date(g.startMs));
            const w = Math.max(0, snap.xOf(new Date(g.endMs)) - x);
            return `${i + 1}. ${isoDay(new Date(g.startMs))} → ${isoDay(new Date(g.endMs))} (${g.days}d) · x=${x}px · w=${Math.round(w)}px`;
          }),
        ].join('\n'),
      );
    }

    return blocks.join('\n\n');
  });

  const nestTreeSection = [
    '## 3. Full arc nest tree (all tracks, parent → child)',
    '(Structure + summaries only — moments are nested under arcs in section 2 and listed fully in section 5.)',
    forest.length === 0
      ? '(no arcs)'
      : forest
          .map((arc, i) =>
            formatArcBlock(arc, {
              depth: 0,
              indexLabel: `${i + 1}.`,
              role: 'ARC',
              snap,
              laneMap: arc.track ? snap.subLaneByTrack[arc.track] : undefined,
              moments: [],
            }).join('\n'),
          )
          .join('\n\n'),
  ].join('\n');

  const clusterSection = [
    '## 4. Moment clusters (as drawn at current zoom)',
    snap.clusters.length === 0
      ? '(none)'
      : snap.clusters
          .map((c, i) => {
            const first = c.entries[0];
            const last = c.entries[c.entries.length - 1];
            return [
              `${i + 1}. [CLUSTER] x=${Math.round(c.x)}px · ${c.entries.length} moment${c.entries.length === 1 ? '' : 's'}`,
              ...fieldLines(1, [
                { label: 'Key', value: c.key },
                { label: 'From', value: isoDay(first?.start_time) },
                { label: 'To', value: isoDay(last?.start_time) },
              ]),
              'Members:',
              ...c.entries.flatMap((e, j) => formatMomentLines(e, 1, `${j + 1}.`, snap)),
            ].join('\n');
          })
          .join('\n\n'),
  ].join('\n');

  const chronoMoments = [...snap.entries].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  const chronoSection = [
    '## 5. All moments chronological (wall time, full text)',
    chronoMoments.length === 0
      ? '(none)'
      : chronoMoments.map((e, i) => formatMomentLines(e, 0, `${i + 1}.`, snap).join('\n')).join('\n\n'),
  ].join('\n');

  const unresolvedSection = [
    '## 6. Temporally unresolved items (not placed on the canvas)',
    snap.unresolvedItems.length === 0
      ? '(none)'
      : snap.unresolvedItems.map((item, i) => [
          `${i + 1}. [UNRESOLVED ${item.kind.toUpperCase()}] ${item.title || '(untitled)'}`,
          ...fieldLines(1, [
            { label: 'Id', value: item.id },
            { label: 'Source kind', value: item.sourceKind },
            { label: 'Source id', value: item.sourceId },
            { label: 'Precision', value: item.timePrecision ?? item.temporal?.occurred.precision },
            { label: 'Confidence', value: item.timeConfidence ?? item.confidence },
            { label: 'Occurrence status', value: item.occurrenceStatus },
            { label: 'Date expression', value: item.temporal?.occurred.expression },
            { label: 'Recorded at', value: item.temporal?.recordedAt },
          ]),
          ...wrapBody(1, 'Content', item.body || ''),
        ].join('\n')).join('\n\n'),
  ].join('\n');

  return [
    '# Omni Swimlanes Timeline — Copy all',
    'Privacy: this user-triggered export includes full lore text and source record ids. Share it deliberately.',
    '',
    SWIMLANES_ARCHITECTURE_LEGEND,
    '',
    canvasState,
    '',
    diagnosticsSection,
    '',
    eraSection,
    '',
    '## 2. Tracks → arcs (drawn bars + nested children + overlapping moments)',
    trackSections.join('\n\n'),
    '',
    nestTreeSection,
    '',
    clusterSection,
    '',
    chronoSection,
    '',
    unresolvedSection,
    '',
    '## End of swimlanes export',
  ].join('\n');
}
