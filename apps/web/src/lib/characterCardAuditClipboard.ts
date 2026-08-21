import type {
  CharacterAuditStatus,
  CharacterCardAuditReport,
  CharacterCardAuditResult,
} from '../api/characterCardAudit';
import { buildListClipboardText } from './listClipboard';

export const CHARACTER_AUDIT_STATUS_LABEL: Record<CharacterAuditStatus, string> = {
  valid_identity: 'Valid identity',
  valid_contextual_reference: 'Contextual reference',
  contextual_character_needs_context: 'Needs contextual rename',
  needs_context: 'Needs context',
  wrong_domain: 'Wrong domain',
  wrong_domain_tool: 'Tool / software',
  wrong_domain_media: 'Media / fandom',
  wrong_domain_band: 'Band / group',
  wrong_domain_role: 'Role / occupation',
  wrong_domain_event: 'Event / show',
  wrong_domain_process: 'Work process',
  wrong_domain_organization: 'Organization / business',
  sentence_bleed: 'Sentence bleed',
  pronoun_fragment: 'Pronoun fragment',
  broken_span: 'Broken span',
  duplicate_or_merge_candidate: 'Possible duplicate',
  junk_test_data: 'Junk / test',
  bare_title_invalid: 'Invalid bare title',
  needs_identity_resolution: 'Identity unresolved',
};

export function characterAuditSuggestedFix(result: CharacterCardAuditResult): string {
  if (result.suggestedTitle) return result.suggestedTitle;
  if (result.recommendedAction === 'merge' && result.mergeCandidates?.length) {
    const names = result.mergeCandidates.map((c) => c.currentTitle);
    return names.length === 1 ? `Merge into ${names[0]}` : `Merge with: ${names.join(' or ')}`;
  }
  if (result.recommendedAction === 'move_to_group') return 'Move to Groups book';
  if (result.recommendedAction === 'move_to_interest') return 'Move to Interests';
  if (result.recommendedAction === 'move_to_book') return 'Move to correct book';
  if (result.recommendedAction === 'delete') return 'Remove card';
  if (result.recommendedAction === 'needs_review') return 'Review provenance before merging';
  return '—';
}

export function buildCharacterCardAuditClipboardText(
  report: Pick<CharacterCardAuditReport, 'characterCount' | 'summary' | 'generatedAt'>,
  results: CharacterCardAuditResult[],
): string {
  const summary = Object.entries(report.summary ?? {})
    .filter(([, count]) => Number(count) > 0)
    .map(([status, count]) => {
      const label = CHARACTER_AUDIT_STATUS_LABEL[status as CharacterAuditStatus] ?? status;
      return `${label} (${count})`;
    });

  return buildListClipboardText({
    title: 'Character card audit',
    filters: [
      report.characterCount ? `${report.characterCount} cards scanned` : null,
      summary.length ? summary.join(', ') : null,
      report.generatedAt ? `generated ${report.generatedAt}` : null,
    ].filter((line): line is string => Boolean(line)),
    items: results.map((result) => ({
      heading: result.currentTitle || 'Untitled card',
      fields: [
        { label: 'Status', value: CHARACTER_AUDIT_STATUS_LABEL[result.status] ?? result.status },
        { label: 'Reason', value: result.reason },
        { label: 'Suggested fix', value: characterAuditSuggestedFix(result) },
        { label: 'Recommended action', value: result.recommendedAction },
        { label: 'Provenance', value: result.provenanceSummary },
        {
          label: 'Merge candidates',
          value: result.mergeCandidates?.map((c) => c.currentTitle) ?? [],
        },
      ],
    })),
  });
}
