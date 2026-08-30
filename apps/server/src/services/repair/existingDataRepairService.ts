import { classifyEntity } from '../entities/entityClassifier';
import { classifyMentionKind } from '../../utils/entityMentionClassifier';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';

type Row = Record<string, unknown> & { id: string; user_id?: string };

export type ExistingDataRepairFinding = {
  kind:
    | 'employer_as_place'
    | 'false_person_candidate'
    | 'resume_contact_fact'
    | 'upload_date_artifact'
    | 'duplicate_organization';
  id: string;
  relatedId?: string;
  table?: 'journal_entries' | 'resolved_events';
  label: string;
  reason: string;
  reversible: true;
};

export type ExistingDataRepairReport = {
  userId: string;
  generatedAt: string;
  findings: ExistingDataRepairFinding[];
  counts: Record<ExistingDataRepairFinding['kind'], number>;
};

const emptyCounts = (): ExistingDataRepairReport['counts'] => ({
  employer_as_place: 0,
  false_person_candidate: 0,
  resume_contact_fact: 0,
  upload_date_artifact: 0,
  duplicate_organization: 0,
});

function metadataOf(row: Row): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
}

function isResumeMetadata(metadata: Record<string, unknown>): boolean {
  return metadata.source === 'resume_upload' || metadata.source_type === 'resume';
}

function isUserConfirmed(metadata: Record<string, unknown>): boolean {
  return metadata.user_confirmed === true
    || metadata.truth_state === 'user_confirmed'
    || metadata.name_source === 'user_confirmed'
    || metadata.identity_source === 'user_confirmed';
}

function alreadyRepaired(metadata: Record<string, unknown>, kind: ExistingDataRepairFinding['kind']): boolean {
  const repair = metadata.repair_review;
  return Boolean(repair && typeof repair === 'object' && (repair as Record<string, unknown>).kind === kind);
}

function isDeterministicEmployerPlace(row: Row, organizationLabels: Set<string>): boolean {
  const metadata = metadataOf(row);
  if (isUserConfirmed(metadata)) return false;
  if (alreadyRepaired(metadata, 'employer_as_place')) return false;
  if (metadata.section === 'employment' || metadata.job_title) return true;
  if (organizationLabels.has(normalizeNameKey(String(row.name ?? '')))) return true;
  const classification = classifyEntity(String(row.name ?? ''), JSON.stringify(metadata));
  return classification.type === 'ORGANIZATION' && /lexicon|employment|company/i.test(classification.reason);
}

function isUploadDateArtifact(row: Row): boolean {
  const metadata = metadataOf(row);
  if (!isResumeMetadata(metadata)) return false;
  if (metadata.temporalSource === 'document_stated' || metadata.occurrence_precision) return false;
  const date = String(row.date ?? row.start_time ?? '');
  const created = String(row.created_at ?? '');
  return Boolean(date && created && date.slice(0, 10) === created.slice(0, 10));
}

export function auditExistingDataRows(input: {
  userId: string;
  characters?: Row[];
  locations?: Row[];
  facts?: Row[];
  journalEntries?: Row[];
  events?: Row[];
  organizations?: Row[];
}): ExistingDataRepairReport {
  const findings: ExistingDataRepairFinding[] = [];
  const add = (finding: ExistingDataRepairFinding) => findings.push(finding);
  const organizationLabels = new Set(
    (input.organizations ?? []).flatMap((row) => [
      row.name,
      ...(Array.isArray(row.aliases) ? row.aliases : []),
    ])
      .filter((label): label is string => typeof label === 'string')
      .map((label) => normalizeNameKey(label)),
  );

  for (const row of input.locations ?? []) {
    if (isDeterministicEmployerPlace(row, organizationLabels)) {
      add({
        kind: 'employer_as_place',
        id: row.id,
        label: String(row.name ?? ''),
        reason: 'Deterministic organization/employment evidence conflicts with the Places book.',
        reversible: true,
      });
    }
  }

  for (const row of input.characters ?? []) {
    const metadata = metadataOf(row);
    if (isUserConfirmed(metadata) || alreadyRepaired(metadata, 'false_person_candidate')) continue;
    const classification = classifyMentionKind(
      String(row.name ?? ''),
      JSON.stringify(metadataOf(row)),
    );
    if (classification.kind !== 'person' && classification.kind !== 'unknown') {
      add({
        kind: 'false_person_candidate',
        id: row.id,
        label: String(row.name ?? ''),
        reason: `Character candidate is classified as ${classification.kind}.`,
        reversible: true,
      });
    }
  }

  for (const row of input.facts ?? []) {
    const metadata = metadataOf(row);
    if (
      isResumeMetadata(metadata)
      && String(row.category ?? '') === 'contact'
      && !alreadyRepaired(metadata, 'resume_contact_fact')
    ) {
      add({
        kind: 'resume_contact_fact',
        id: row.id,
        label: String(row.fact ?? ''),
        reason: 'Resume contact data was written as an active entity fact and needs review.',
        reversible: true,
      });
    }
  }

  for (const row of [...(input.journalEntries ?? []), ...(input.events ?? [])]) {
    if (isUploadDateArtifact(row) && !alreadyRepaired(metadataOf(row), 'upload_date_artifact')) {
      add({
        kind: 'upload_date_artifact',
        id: row.id,
        table: (input.events ?? []).some((event) => event.id === row.id) ? 'resolved_events' : 'journal_entries',
        label: String(row.title ?? row.content ?? ''),
        reason: 'Stored date matches the upload timestamp without explicit occurrence evidence.',
        reversible: true,
      });
    }
  }

  const organizations = input.organizations ?? [];
  const canonicalByName = new Map<string, Row>();
  for (const row of organizations) {
    const labels = [row.name, ...(Array.isArray(row.aliases) ? row.aliases : [])]
      .filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
    for (const label of labels) {
      const key = normalizeNameKey(label);
      const prior = canonicalByName.get(key);
      if (prior && prior.id !== row.id) {
        add({
          kind: 'duplicate_organization',
          id: row.id,
          relatedId: prior.id,
          label: String(row.name ?? ''),
          reason: `Organization label "${label}" collides with another user-owned organization.`,
          reversible: true,
        });
        break;
      }
      canonicalByName.set(key, row);
    }
  }

  const counts = emptyCounts();
  for (const finding of findings) counts[finding.kind] += 1;
  return {
    userId: input.userId,
    generatedAt: new Date().toISOString(),
    findings,
    counts,
  };
}

export class ExistingDataRepairService {
  async auditUser(userId: string): Promise<ExistingDataRepairReport> {
    const [
      characters,
      locations,
      facts,
      journalEntries,
      events,
      organizations,
    ] = await Promise.all([
      supabaseAdmin.from('characters').select('id, user_id, name, metadata, status').eq('user_id', userId).limit(1000),
      supabaseAdmin.from('locations').select('id, user_id, name, metadata, type').eq('user_id', userId).limit(1000),
      supabaseAdmin.from('entity_facts').select('id, user_id, fact, category, metadata, status').eq('user_id', userId).limit(2000),
      supabaseAdmin.from('journal_entries').select('id, user_id, content, date, created_at, metadata').eq('user_id', userId).limit(2000),
      supabaseAdmin.from('resolved_events').select('id, user_id, title, start_time, created_at, metadata').eq('user_id', userId).limit(2000),
      supabaseAdmin.from('organizations').select('id, user_id, name, aliases, metadata').eq('user_id', userId).limit(1000),
    ]);
    const failed = [characters, locations, facts, journalEntries, events, organizations].find((result) => result.error);
    if (failed?.error) throw failed.error;
    return auditExistingDataRows({
      userId,
      characters: (characters.data ?? []) as Row[],
      locations: (locations.data ?? []) as Row[],
      facts: (facts.data ?? []) as Row[],
      journalEntries: (journalEntries.data ?? []) as Row[],
      events: (events.data ?? []) as Row[],
      organizations: (organizations.data ?? []) as Row[],
    });
  }

  async applyUserReport(report: ExistingDataRepairReport): Promise<ExistingDataRepairReport> {
    for (const finding of report.findings) {
      if (finding.kind === 'false_person_candidate') {
        const { data } = await supabaseAdmin
          .from('characters')
          .select('metadata')
          .eq('id', finding.id)
          .eq('user_id', report.userId)
          .maybeSingle();
        if (alreadyRepaired(metadataOf((data ?? {}) as Row), finding.kind)) continue;
        await supabaseAdmin
          .from('characters')
          .update({
            status: 'archived',
            metadata: {
              ...metadataOf((data ?? {}) as Row),
              repair_review: { kind: finding.kind, reason: finding.reason, applied_at: new Date().toISOString() },
            },
          })
          .eq('id', finding.id)
          .eq('user_id', report.userId);
        continue;
      }

      const table =
        finding.kind === 'employer_as_place' ? 'locations' :
        finding.kind === 'resume_contact_fact' ? 'entity_facts' :
        finding.kind === 'upload_date_artifact' ? (finding.table ?? 'journal_entries') : null;
      if (!table) continue;

      const { data } = await supabaseAdmin
        .from(table)
        .select('metadata')
        .eq('id', finding.id)
        .eq('user_id', report.userId)
        .maybeSingle();
      if (alreadyRepaired(metadataOf((data ?? {}) as Row), finding.kind)) continue;
      await supabaseAdmin
        .from(table)
        .update({
          metadata: {
            ...metadataOf((data ?? {}) as Row),
            repair_review: {
              kind: finding.kind,
              reason: finding.reason,
              review_state: 'pending',
              applied_at: new Date().toISOString(),
            },
          },
        })
        .eq('id', finding.id)
        .eq('user_id', report.userId);
    }
    return report;
  }
}

export const existingDataRepairService = new ExistingDataRepairService();
