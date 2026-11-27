import type { LifeArcProposal, LifeArcProposalAudit } from '../hooks/useLifeArcProposals';
import { TRACK_LABELS, type LifeArc } from '../hooks/useLifeArcs';
import { buildListClipboardText, formatClipboardFields } from './listClipboard';

export type LifeArcProposalsDiagnosticSnapshot = {
  proposals: LifeArcProposal[];
  audit?: LifeArcProposalAudit | null;
  arcs?: LifeArc[];
  canonicalItemCount?: number;
  suppressedArcs?: Record<string, number>;
};

function line(text: string): string {
  return text;
}

function section(title: string, body: string[]): string[] {
  if (!body.length) return [];
  return [line(`## ${title}`), ...body, ''];
}

/** Plain-text export for all users — titles, dates, explanations, and supporting moments. */
export function buildLifeArcProposalsClipboardText(proposals: LifeArcProposal[]): string {
  return buildListClipboardText({
    title: 'Life arc suggestions',
    items: proposals.map((proposal) => ({
      heading: proposal.title,
      fields: [
        { label: 'Swimlane', value: TRACK_LABELS[proposal.track] },
        { label: 'Dates', value: `${proposal.start_date} → ${proposal.end_date}` },
        { label: 'Confidence', value: `${Math.round(proposal.confidence * 100)}%` },
      ],
      body: [
        proposal.explanation,
        proposal.evidence.length
          ? `Supporting moments:\n${proposal.evidence
              .map((item) => {
                const intake = item.intakeChannel ? ` · ${item.intakeChannel}` : '';
                const sourceSummary = item.sources?.length
                  ? `\n  Sources: ${item.sources.map((source) => source.label ?? source.kind).join(', ')}`
                  : '';
                const entitySummary = item.entities?.length
                  ? `\n  Related: ${item.entities.map((entity) => entity.name ?? `${entity.kind}:${entity.id}`).join(', ')}`
                  : '';
                return `- ${item.title} (${item.occurredAt.slice(0, 10)}${intake})${sourceSummary}${entitySummary}`;
              })
              .join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    })),
  });
}

/** Admin/developer diagnostic dump for life arc proposal debugging. */
export function buildLifeArcProposalsDiagnosticClipboardText(
  snapshot: LifeArcProposalsDiagnosticSnapshot,
): string {
  const { proposals, audit, arcs = [], canonicalItemCount, suppressedArcs = {} } = snapshot;
  const exportedAt = new Date().toISOString();

  const header = [
    '# Life arc suggestions — admin diagnostic dump',
    `Exported: ${exportedAt}`,
    `Pending proposals: ${proposals.length}`,
  ];

  const auditLines = audit
    ? section('Build audit', [
        ...formatClipboardFields([
          { label: 'canonicalItems', value: audit.canonicalItems },
          { label: 'datedItems', value: audit.datedItems },
          { label: 'eligibleItems', value: audit.eligibleItems },
          { label: 'unresolvedItems', value: audit.unresolvedItems },
          { label: 'existingArcs', value: audit.existingArcs },
          { label: 'drawableArcs', value: audit.drawableArcs },
          { label: 'proposedArcs', value: audit.proposedArcs },
        ]).split('\n').map(line),
        ...(Object.keys(audit.suppressedArcs ?? {}).length
          ? [line('suppressedArcs:'), ...Object.entries(audit.suppressedArcs ?? {}).map(([reason, count]) => line(`  ${reason}: ${count}`))]
          : []),
        ...(audit.dataErrors.length
          ? [line('dataErrors:'), ...audit.dataErrors.map((entry) => line(`  ${entry.source}: ${entry.message}`))]
          : []),
      ])
    : canonicalItemCount != null
      ? section('Context', [line(`canonicalItemCount: ${canonicalItemCount}`)])
      : [];

  const suppressedLines = Object.keys(suppressedArcs).length
    ? section('Suppressed drawable arcs', Object.entries(suppressedArcs).map(([reason, count]) => line(`${reason}: ${count}`)))
    : [];

  const existingArcLines = arcs.length
    ? section(
        'Existing arcs',
        arcs.map((arc) => {
          const fields = formatClipboardFields([
            { label: 'id', value: arc.id },
            { label: 'title', value: arc.title },
            { label: 'track', value: arc.track },
            { label: 'start', value: arc.start_date },
            { label: 'end', value: arc.end_date },
            { label: 'bar_eligibility', value: arc.bar_eligibility?.reason ?? 'drawable' },
          ]);
          return line(`- ${arc.title}\n  ${fields.replace(/\n/g, '\n  ')}`);
        }),
      )
    : [];

  const proposalLines = section(
    'Pending proposals',
    proposals.flatMap((proposal, index) => {
      const meta = formatClipboardFields([
        { label: 'id', value: proposal.id },
        { label: 'fingerprint', value: proposal.fingerprint },
        { label: 'status', value: proposal.status },
        { label: 'arc_type', value: proposal.arc_type },
        { label: 'track', value: `${proposal.track} (${TRACK_LABELS[proposal.track]})` },
        { label: 'dates', value: `${proposal.start_date} → ${proposal.end_date}` },
        { label: 'confidence', value: proposal.confidence },
        { label: 'source_record_ids', value: proposal.source_record_ids },
      ]);

      const evidenceLines = proposal.evidence.flatMap((item) => {
        const evidenceMeta = formatClipboardFields([
          { label: 'sourceKind', value: item.sourceKind },
          { label: 'sourceId', value: item.sourceId },
          { label: 'sourceIds', value: item.sourceIds },
          { label: 'sourceType', value: item.sourceType },
          { label: 'intakeChannel', value: item.intakeChannel },
          { label: 'occurredAt', value: item.occurredAt },
          { label: 'confidence', value: item.confidence },
        ]);
        const sourceLines = (item.sources ?? []).map((source) =>
          line(`      source: ${source.kind}:${source.id}${source.label ? ` (${source.label})` : ''}`),
        );
        const entityLines = (item.entities ?? []).map((entity) =>
          line(`      entity: ${entity.kind}:${entity.id}${entity.name ? ` (${entity.name})` : ''}`),
        );
        return [
          line(`    - ${item.title}\n      ${evidenceMeta.replace(/\n/g, '\n      ')}`),
          ...sourceLines,
          ...entityLines,
        ];
      });

      return [
        line(`${index + 1}. ${proposal.title}`),
        ...meta.split('\n').map((entry) => line(`  ${entry}`)),
        line(`  explanation: ${proposal.explanation}`),
        line('  evidence:'),
        ...evidenceLines,
        '',
      ];
    }),
  );

  return [...header, '', ...auditLines, ...suppressedLines, ...existingArcLines, ...proposalLines].join('\n').trim();
}
