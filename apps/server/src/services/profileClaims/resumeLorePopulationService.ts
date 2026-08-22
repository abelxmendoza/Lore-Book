/**
 * Populate the knowledge base from a structured resume parse.
 * Creates chronological journal entries, timeline events, skills, employers, and contact facts.
 */
import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { organizationService } from '../organizationService';
import { projectSuggestionService } from '../projects/projectSuggestionService';
import { skillService } from '../skills/skillService';
import { applySuggestionCandidate } from '../lorebook/suggestions/applySuggestionCandidate';
import { withSuggestionWriteContext } from '../lorebook/suggestions/suggestionWriteContext';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';

import type {
  ParsedResume,
  ResumeEducation,
  ResumeEmployment,
  ResumeEmploymentGap,
  ResumeLorePopulationResult,
  ResumeProject,
} from './resumeStructuredTypes';
import { normalizeResumeDate } from './resumeDateUtils';
import { resumeCharacterEnrichmentService } from './resumeCharacterEnrichmentService';
import { conflictedCompanyKeys, resumeRoleConflictService } from './resumeRoleConflictService';

export { normalizeResumeDate } from './resumeDateUtils';

const PROVENANCE = (sourceFileId: string, resumeDocumentId: string) => ({
  source: 'resume_upload',
  source_file_id: sourceFileId,
  resume_document_id: resumeDocumentId,
  provenance: 'resume_lore_population',
});

function monthsBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function detectEmploymentGaps(employment: ResumeEmployment[]): ResumeEmploymentGap[] {
  const sorted = [...employment]
    .map((e) => ({
      ...e,
      start: normalizeResumeDate(e.startDate),
      end: normalizeResumeDate(e.endDate) ?? (e.isCurrent ? new Date().toISOString().split('T')[0] : null),
    }))
    .filter((e) => e.start)
    .sort((a, b) => a.start!.localeCompare(b.start!));

  const gaps: ResumeEmploymentGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = sorted[i].end;
    const nextStart = sorted[i + 1].start;
    if (!end || !nextStart) continue;
    if (monthsBetween(end, nextStart) >= 2) {
      gaps.push({
        startDate: end,
        endDate: nextStart,
        label: `Between ${sorted[i].company} and ${sorted[i + 1].company}`,
      });
    }
  }
  return gaps;
}

function skillCategory(name: string): 'technical' | 'professional' | 'creative' | 'other' {
  const tech = /\b(javascript|typescript|python|react|node|sql|aws|java|css|html|docker|kubernetes|git)\b/i;
  if (tech.test(name)) return 'technical';
  return 'professional';
}

async function resolveSelfCharacterId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .limit(20);
  const rows = data ?? [];
  const me = rows.find((c) => /^me$/i.test(c.name) || /^self$/i.test(c.name));
  return me?.id ?? rows[0]?.id ?? null;
}

class ResumeLorePopulationService {
  async populate(
    userId: string,
    parsed: ParsedResume,
    context: { sourceFileId: string; resumeDocumentId: string; fileName: string }
  ): Promise<ResumeLorePopulationResult> {
    const result: ResumeLorePopulationResult = {
      journalEntries: 0,
      timelineEvents: 0,
      skills: 0,
      organizations: 0,
      facts: 0,
      characterAttributes: 0,
      projectsSuggested: 0,
      roleConflicts: [],
      entryIds: [],
      eventIds: [],
      itemsReconciled: 0,
    };

    const meta = {
      ...PROVENANCE(context.sourceFileId, context.resumeDocumentId),
      file_name: context.fileName,
      imported_at: new Date().toISOString(),
    };
    const selfId = await resolveSelfCharacterId(userId);

    // Contact info → entity facts + summary entry
    await this.populateContact(userId, parsed, meta, selfId, result);

    // Review-first: resume-current jobs that disagree with the existing current
    // employer become review conflicts and never take over "current" silently.
    try {
      result.roleConflicts = await resumeRoleConflictService.detectForUser(
        userId,
        parsed.employment,
        context.sourceFileId
      );
    } catch (error) {
      logger.warn({ error, userId }, 'resume lore: role conflict detection failed (non-blocking)');
    }
    const conflictedCompanies = conflictedCompanyKeys(result.roleConflicts);

    await withSuggestionWriteContext(userId, async () => {
    // Employers as organizations
    for (const job of parsed.employment) {
      const conflicted = job.isCurrent && conflictedCompanies.has(normalizeNameKey(job.company));
      try {
        const write = await applySuggestionCandidate({
          userId,
          domain: 'organizations',
          name: job.company,
          incomingType: 'company',
          evidence: [job.title, job.description, job.location].filter(Boolean).join(' · '),
          extractor: 'resume_import',
          source: 'resume',
          writePolicy: 'trusted_import',
          onCreate: async () => {
            await organizationService.createOrganization(userId, {
              name: job.company,
              type: 'company',
              group_type: 'company',
              user_relationship: 'member',
              description: job.description ?? `${job.title}${job.location ? ` · ${job.location}` : ''}`,
              status: job.isCurrent && !conflicted ? 'active' : 'inactive',
              metadata: {
                ...meta,
                section: 'employment',
                job_title: job.title,
                start_date: job.startDate,
                end_date: job.endDate,
                ...(conflicted
                  ? {
                      pending_status_review: true,
                      status_conflict: result.roleConflicts.find(
                        (c) => normalizeNameKey(c.resumeCompany) === normalizeNameKey(job.company)
                      ),
                    }
                  : {}),
              },
            });
          },
        });
        if (write.outcome === 'CREATED' || write.outcome === 'ATTACHED') {
          result.organizations++;
        }
      } catch (error) {
        logger.warn({ error, company: job.company }, 'resume lore: org create skipped');
      }
    }

    // Skills
    const seenSkills = new Set<string>();
    for (const raw of parsed.skills) {
      const name = raw.trim();
      if (!name || seenSkills.has(name.toLowerCase())) continue;
      seenSkills.add(name.toLowerCase());
      try {
        const write = await applySuggestionCandidate({
          userId,
          domain: 'skills',
          name,
          evidence: `From resume: ${context.fileName}`,
          extractor: 'resume_import',
          source: 'resume',
          writePolicy: 'trusted_import',
          onCreate: async () => {
            await skillService.createSkill(userId, {
              skill_name: name,
              skill_category: skillCategory(name),
              description: `From resume: ${context.fileName}`,
              auto_detected: true,
              confidence_score: 0.85,
              metadata: { ...meta, section: 'skills' },
            });
          },
        });
        if (write.outcome === 'CREATED' || write.outcome === 'ATTACHED') {
          result.skills++;
        }
      } catch (error) {
        logger.warn({ error, skill: name }, 'resume lore: skill create skipped');
      }
    }

    // Projects → Projects book as review-first suggestions (rule: projects never
    // land in Characters/Places; they surface as pending Project cards).
    if (parsed.projects.length > 0) {
      try {
        result.projectsSuggested = await projectSuggestionService.upsertManyFromExtraction(
          userId,
          parsed.projects.map((project) => ({
            name: project.name,
            description: project.description,
            type: 'project',
            status: project.endDate ? ('completed' as const) : ('active' as const),
            confidence: 0.85,
            reasoning: `Listed under Technical Projects in resume ${context.fileName}`,
            evidence: [
              [project.name, project.description].filter(Boolean).join(' — ').slice(0, 300),
            ],
          })),
          { source: 'resume' }
        );
      } catch (error) {
        logger.warn({ error, userId }, 'resume lore: project suggestions failed (non-blocking)');
      }
    }
    });

    // Languages + career targets → facts on self
    if (selfId) {
      for (const language of parsed.languages ?? []) {
        const ok = await this.insertSelfFact(userId, selfId, `Language: ${language}`, 'general', {
          ...meta,
          section: 'languages',
        });
        if (ok) result.facts++;
      }
      for (const target of parsed.careerTargets ?? []) {
        const ok = await this.insertSelfFact(userId, selfId, `Career target: ${target}`, 'career', {
          ...meta,
          section: 'summary',
        });
        if (ok) result.facts++;
      }
    }

    // Chronological timeline items
    type TimelineItem =
      | { kind: 'job'; date: string; job: ResumeEmployment }
      | { kind: 'education'; date: string; edu: ResumeEducation }
      | { kind: 'project'; date: string; project: ResumeProject }
      | { kind: 'gap'; date: string; gap: ResumeEmploymentGap };

    const items: TimelineItem[] = [];

    for (const job of parsed.employment) {
      const date = normalizeResumeDate(job.startDate) ?? normalizeResumeDate(job.endDate) ?? '';
      items.push({ kind: 'job', date, job });
    }
    for (const edu of parsed.education) {
      const date = normalizeResumeDate(edu.endDate) ?? normalizeResumeDate(edu.startDate) ?? '';
      items.push({ kind: 'education', date, edu });
    }
    for (const project of parsed.projects) {
      const date = normalizeResumeDate(project.endDate) ?? normalizeResumeDate(project.startDate) ?? '';
      items.push({ kind: 'project', date, project });
    }
    for (const gap of parsed.employmentGaps) {
      items.push({ kind: 'gap', date: gap.startDate, gap });
    }

    items.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    for (const item of items) {
      if (item.kind === 'job') {
        const { entryId, eventId, reconciled } = await this.createJobLore(userId, item.job, meta, selfId);
        if (reconciled) {
          result.itemsReconciled++;
          if (eventId) result.eventIds.push(eventId);
          if (entryId) {
            result.entryIds.push(entryId);
            result.journalEntries++;
          }
          continue;
        }
        if (entryId) {
          result.entryIds.push(entryId);
          result.journalEntries++;
        }
        if (eventId) {
          result.eventIds.push(eventId);
          result.timelineEvents++;
        }
      } else if (item.kind === 'education') {
        const { entryId, eventId, reconciled } = await this.createEducationEntry(userId, item.edu, meta, selfId);
        if (reconciled) {
          result.itemsReconciled++;
          if (eventId) result.eventIds.push(eventId);
          continue;
        }
        if (entryId) {
          result.entryIds.push(entryId);
          result.journalEntries++;
        }
        if (eventId) {
          result.eventIds.push(eventId);
          result.timelineEvents++;
        }
      } else if (item.kind === 'project') {
        const entryId = await this.createProjectEntry(userId, item.project, meta);
        if (entryId) {
          result.entryIds.push(entryId);
          result.journalEntries++;
        }
      } else if (item.kind === 'gap') {
        const entryId = await this.createGapEntry(userId, item.gap, meta);
        if (entryId) {
          result.entryIds.push(entryId);
          result.journalEntries++;
        }
      }
    }

    if (parsed.summary?.trim()) {
      const entry = await memoryService.saveEntry({
        userId,
        content: `Career summary (from resume):\n\n${parsed.summary.trim()}`,
        importedAt: String(meta.imported_at ?? new Date().toISOString()),
        tags: ['resume', 'career', 'summary'],
        source: 'document_upload',
        metadata: meta,
      });
      result.entryIds.push(entry.id);
      result.journalEntries++;
    }

    try {
      const enriched = await resumeCharacterEnrichmentService.enrichSelfFromResume(userId, parsed, {
        sourceFileId: context.sourceFileId,
        fileName: context.fileName,
      });
      result.characterAttributes = enriched.attributes;
    } catch (error) {
      logger.warn({ error, userId }, 'resume lore: character enrichment failed (non-blocking)');
    }

    return result;
  }

  private async insertSelfFact(
    userId: string,
    selfId: string,
    fact: string,
    category: string,
    metadata: Record<string, unknown>
  ): Promise<boolean> {
    const { error } = await supabaseAdmin.from('entity_facts').insert({
      user_id: userId,
      entity_id: selfId,
      entity_type: 'character',
      fact,
      category,
      confidence: 0.85,
      mention_count: 1,
      status: 'active',
      first_seen_at: new Date().toISOString(),
      last_confirmed_at: new Date().toISOString(),
      metadata,
    });
    if (error) {
      logger.warn({ error, fact }, 'resume lore: self fact insert skipped');
      return false;
    }
    return true;
  }

  private async populateContact(
    userId: string,
    parsed: ParsedResume,
    meta: Record<string, unknown>,
    selfId: string | null,
    result: ResumeLorePopulationResult
  ): Promise<void> {
    const { contact } = parsed;
    const lines: string[] = [];
    if (contact.fullName) lines.push(`Name: ${contact.fullName}`);
    if (contact.email) lines.push(`Email: ${contact.email}`);
    if (contact.phone) lines.push(`Phone: ${contact.phone}`);
    if (contact.address) lines.push(`Address: ${contact.address}`);
    if (contact.website) lines.push(`Website: ${contact.website}`);
    if (contact.linkedin) lines.push(`LinkedIn: ${contact.linkedin}`);
    if (lines.length === 0) return;

    const entry = await memoryService.saveEntry({
      userId,
      content: `Contact information (from resume):\n${lines.join('\n')}`,
      importedAt: String(meta.imported_at ?? new Date().toISOString()),
      tags: ['resume', 'contact'],
      source: 'document_upload',
      metadata: { ...meta, section: 'header', contact },
    });
    result.entryIds.push(entry.id);
    result.journalEntries++;

    if (!selfId) return;
    const factPairs: Array<[string, string]> = [
      ['email', contact.email ?? ''],
      ['phone', contact.phone ?? ''],
      ['address', contact.address ?? ''],
      ['website', contact.website ?? ''],
      ['linkedin', contact.linkedin ?? ''],
    ].filter(([, v]) => v) as Array<[string, string]>;

    for (const [key, value] of factPairs) {
      const { error } = await supabaseAdmin.from('entity_facts').insert({
        user_id: userId,
        entity_id: selfId,
        entity_type: 'character',
        fact: `${key}: ${value}`,
        category: 'contact',
        confidence: 0.9,
        mention_count: 1,
        status: 'active',
        first_seen_at: new Date().toISOString(),
        last_confirmed_at: new Date().toISOString(),
        metadata: meta,
      });
      if (!error) result.facts++;
    }
  }

  /**
   * Different resumes describe the same job differently (a robotics-focused
   * resume and a failure-analysis-focused resume both list the same Vanguard
   * Robotics role) — match on company + start date so a second, third, or
   * fourth resume reinforces the existing timeline entry instead of piling
   * up duplicates. No start date means no reliable anchor to match on, so
   * those always create fresh (matches prior behavior).
   */
  private async findExistingEvent(
    userId: string,
    type: 'career' | 'education',
    companyOrInstitution: string,
    start: string | null
  ): Promise<string | null> {
    if (!start) return null;
    const { data, error } = await supabaseAdmin
      .from('resolved_events')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('start_time', start);
    if (error || !data?.length) return null;

    const targetKey = normalizeNameKey(companyOrInstitution);
    const match = data.find((row) => {
      const md = row.metadata as { employment?: { company?: string }; education?: { institution?: string } } | null;
      const name = type === 'career' ? md?.employment?.company : md?.education?.institution;
      return name ? normalizeNameKey(name) === targetKey : false;
    });
    return match?.id ?? null;
  }

  /**
   * Records that another resume also confirms this event — and, since
   * resumes are usually tailored per application, preserves that resume's
   * specific framing (title emphasis, which bullet points it led with)
   * instead of discarding it. The first-seen title/summary stays canonical;
   * every distinct variant accumulates in metadata so nothing tailored gets
   * silently lost just because the underlying job was already known.
   */
  private async reinforceExistingEvent(
    eventId: string,
    variant: { sourceFileId: string; fileName: string; title?: string; description?: string; location?: string }
  ): Promise<{ isNewVariant: boolean }> {
    const { data } = await supabaseAdmin
      .from('resolved_events')
      .select('metadata, confidence')
      .eq('id', eventId)
      .maybeSingle();
    if (!data) return { isNewVariant: false };
    const metadata = (data.metadata as Record<string, unknown>) ?? {};
    const priorSources = Array.isArray(metadata.confirming_source_file_ids)
      ? (metadata.confirming_source_file_ids as string[])
      : [];
    if (priorSources.includes(variant.sourceFileId)) return { isNewVariant: false }; // same file re-processed

    const priorVariants = Array.isArray(metadata.resume_variants)
      ? (metadata.resume_variants as Array<Record<string, unknown>>)
      : [];

    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          ...metadata,
          confirming_source_file_ids: [...priorSources, variant.sourceFileId],
          resume_variants: [
            ...priorVariants,
            {
              source_file_id: variant.sourceFileId,
              file_name: variant.fileName,
              title: variant.title,
              description: variant.description,
              location: variant.location,
              confirmed_at: new Date().toISOString(),
            },
          ],
        },
        // Corroboration across independent resumes is itself evidence — nudge
        // confidence up slightly, capped well short of 1.0.
        confidence: Math.min(0.97, (typeof data.confidence === 'number' ? data.confidence : 0.85) + 0.03),
      })
      .eq('id', eventId);
    return { isNewVariant: true };
  }

  private async createJobLore(
    userId: string,
    job: ResumeEmployment,
    meta: Record<string, unknown>,
    selfId: string | null
  ): Promise<{ entryId: string | null; eventId: string | null; reconciled: boolean }> {
    const start = normalizeResumeDate(job.startDate);
    const end = job.isCurrent ? null : normalizeResumeDate(job.endDate);

    const existingEventId = await this.findExistingEvent(userId, 'career', job.company, start);
    if (existingEventId) {
      const sourceFileId = String(meta.source_file_id ?? '');
      const { isNewVariant } = await this.reinforceExistingEvent(existingEventId, {
        sourceFileId,
        fileName: String(meta.file_name ?? job.company),
        title: job.title,
        description: job.description,
        location: job.location,
      });
      // A tailored resume adds real, searchable detail even when the job
      // itself isn't new — worth its own small memory entry, just not
      // another "started at X" timeline event.
      let entryId: string | null = null;
      if (isNewVariant && job.description) {
        const entry = await memoryService.saveEntry({
          userId,
          content: `Additional detail on your ${job.title} role at ${job.company} (from a different resume): ${job.description}`,
          date: start ?? undefined,
          temporalSource: start ? 'document_stated' : 'recording_fallback',
          importedAt: String(meta.imported_at ?? new Date().toISOString()),
          tags: ['resume', 'career', 'employment', 'variant', job.company.toLowerCase().replace(/\s+/g, '-')],
          source: 'document_upload',
          summary: `${job.company} — additional resume detail`,
          metadata: { ...meta, section: 'employment_variant', employment: job, related_event_id: existingEventId },
        });
        entryId = entry.id;
      }
      return { entryId, eventId: existingEventId, reconciled: true };
    }

    const dateLabel = [start, end ?? (job.isCurrent ? 'Present' : null)].filter(Boolean).join(' – ');

    const content = [
      `Worked as ${job.title} at ${job.company}.`,
      dateLabel ? `Dates: ${dateLabel}.` : null,
      job.location ? `Location: ${job.location}.` : null,
      job.description ? `\n${job.description}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    const occurrence = start ?? end ?? undefined;
    const entry = await memoryService.saveEntry({
      userId,
      content,
      date: occurrence,
      temporalSource: occurrence ? 'document_stated' : 'recording_fallback',
      importedAt: String(meta.imported_at ?? new Date().toISOString()),
      tags: ['resume', 'career', 'employment', job.company.toLowerCase().replace(/\s+/g, '-')],
      source: 'document_upload',
      summary: `${job.title} at ${job.company}`,
      metadata: { ...meta, section: 'employment', employment: job },
    });

    let eventId: string | null = null;
    if (start) {
      eventId = randomUUID();
      const { error } = await supabaseAdmin.from('resolved_events').insert({
        id: eventId,
        user_id: userId,
        title: `Started at ${job.company}`,
        summary: `${job.title} at ${job.company}`,
        type: 'career',
        start_time: start,
        end_time: end,
        confidence: 0.88,
        tags: ['resume', 'employment'],
        people: selfId ? [selfId] : [],
        metadata: { ...meta, section: 'employment', employment: job },
      });
      if (error) {
        logger.warn({ error, company: job.company }, 'resume lore: timeline event failed');
        eventId = null;
      }
    }

    return { entryId: entry.id, eventId, reconciled: false };
  }

  private async createEducationEntry(
    userId: string,
    edu: ResumeEducation,
    meta: Record<string, unknown>,
    selfId: string | null
  ): Promise<{ entryId: string | null; eventId: string | null; reconciled: boolean }> {
    const start = normalizeResumeDate(edu.startDate);
    const end = normalizeResumeDate(edu.endDate);

    const existingEventId = await this.findExistingEvent(userId, 'education', edu.institution ?? '', start ?? end);
    if (existingEventId) {
      await this.reinforceExistingEvent(existingEventId, {
        sourceFileId: String(meta.source_file_id ?? ''),
        fileName: String(meta.file_name ?? edu.institution ?? ''),
        title: edu.degree,
        description: edu.field,
      });
      return { entryId: null, eventId: existingEventId, reconciled: true };
    }

    const date = end ?? start ?? undefined;
    const parts = [
      edu.degree,
      edu.field ? `in ${edu.field}` : null,
      edu.institution ? `at ${edu.institution}` : null,
    ].filter(Boolean);
    const entry = await memoryService.saveEntry({
      userId,
      content: `Education: ${parts.join(' ')}${edu.gpa ? ` (GPA: ${edu.gpa})` : ''}.`,
      date,
      temporalSource: date ? 'document_stated' : 'recording_fallback',
      importedAt: String(meta.imported_at ?? new Date().toISOString()),
      tags: ['resume', 'education', edu.institution?.toLowerCase().replace(/\s+/g, '-') ?? 'school'],
      source: 'document_upload',
      summary: `Education at ${edu.institution}`,
      metadata: { ...meta, section: 'education', education: edu, timeline_track: 'education' },
    });

    let eventId: string | null = null;
    if (start || end) {
      eventId = randomUUID();
      const { error } = await supabaseAdmin.from('resolved_events').insert({
        id: eventId,
        user_id: userId,
        title: edu.degree ? `${edu.degree} — ${edu.institution}` : `Attended ${edu.institution}`,
        summary: parts.join(' '),
        type: 'education',
        start_time: start ?? end,
        end_time: end ?? null,
        confidence: 0.86,
        tags: ['resume', 'education'],
        people: selfId ? [selfId] : [],
        metadata: { ...meta, section: 'education', education: edu, timeline_track: 'education' },
      });
      if (error) {
        logger.warn({ error, institution: edu.institution }, 'resume lore: education event failed');
        eventId = null;
      }
    }

    return { entryId: entry.id, eventId, reconciled: false };
  }

  private async createProjectEntry(
    userId: string,
    project: ResumeProject,
    meta: Record<string, unknown>
  ): Promise<string> {
    const date =
      normalizeResumeDate(project.endDate) ??
      normalizeResumeDate(project.startDate) ??
      undefined;
    const tech = project.technologies?.length ? `\nTechnologies: ${project.technologies.join(', ')}` : '';
    const entry = await memoryService.saveEntry({
      userId,
      content: `Project: ${project.name}.${project.description ? ` ${project.description}` : ''}${tech}${project.url ? `\n${project.url}` : ''}`,
      date,
      temporalSource: date ? 'document_stated' : 'recording_fallback',
      importedAt: String(meta.imported_at ?? new Date().toISOString()),
      tags: ['resume', 'project'],
      source: 'document_upload',
      summary: project.name,
      metadata: { ...meta, section: 'projects', project },
    });
    return entry.id;
  }

  private async createGapEntry(
    userId: string,
    gap: ResumeEmploymentGap,
    meta: Record<string, unknown>
  ): Promise<string> {
    const entry = await memoryService.saveEntry({
      userId,
      content: `Period between jobs (${gap.label}): ${gap.startDate} to ${gap.endDate}.`,
      date: gap.startDate,
      temporalSource: 'document_stated',
      importedAt: String(meta.imported_at ?? new Date().toISOString()),
      tags: ['resume', 'career', 'unemployment'],
      source: 'document_upload',
      summary: 'Between jobs',
      metadata: { ...meta, section: 'employment', employment_gap: gap },
    });
    return entry.id;
  }
}

export const resumeLorePopulationService = new ResumeLorePopulationService();
