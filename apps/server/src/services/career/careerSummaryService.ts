/**
 * Career summary read model — aggregates resume parse, claims, skills, orgs, timeline.
 */
import { profileClaimsService } from '../profileClaims/profileClaimsService';
import { resumeParsingService } from '../profileClaims/resumeParsingService';
import { detectEmploymentGaps, normalizeResumeDate } from '../profileClaims/resumeLorePopulationService';
import type { ParsedResume, ResumeContact, ResumeEmployment } from '../profileClaims/resumeStructuredTypes';
import { skillService } from '../skills/skillService';
import { supabaseAdmin } from '../supabaseClient';

export type CareerTimelineItem = {
  id: string;
  kind: 'employment' | 'education' | 'gap' | 'event';
  title: string;
  subtitle?: string;
  startDate: string | null;
  endDate: string | null;
  source: 'resume' | 'timeline' | 'inferred';
};

export type CareerSummary = {
  generatedAt: string;
  hasResumeData: boolean;
  currentRole: { title: string; company: string; startDate?: string | null } | null;
  contact: ResumeContact;
  employment: ResumeEmployment[];
  education: ParsedResume['education'];
  employmentGaps: ParsedResume['employmentGaps'];
  skills: Array<{ id: string; name: string; category: string; fromResume: boolean }>;
  employers: Array<{ id: string; name: string; status?: string }>;
  timeline: CareerTimelineItem[];
  stats: {
    jobCount: number;
    schoolCount: number;
    skillCount: number;
    employerCount: number;
    unverifiedClaims: number;
    resumeUploadCount: number;
    timelineEventCount: number;
  };
  latestResume: {
    documentId: string;
    fileId: string | null;
    fileName: string;
    uploadedAt: string;
  } | null;
};

function pickStructured(resume: { parsed_data: Record<string, unknown> }): ParsedResume | null {
  const structured = resume.parsed_data?.structured as ParsedResume | undefined;
  if (!structured) return null;
  return structured;
}

function resolveCurrentRole(employment: ResumeEmployment[]): CareerSummary['currentRole'] {
  const current = employment.find((e) => e.isCurrent) ?? employment[0];
  if (!current) return null;
  return {
    title: current.title,
    company: current.company,
    startDate: current.startDate ?? null,
  };
}

function buildTimeline(
  structured: ParsedResume | null,
  events: Array<{ id: string; title: string; start_time: string | null; end_time: string | null }>
): CareerTimelineItem[] {
  const items: CareerTimelineItem[] = [];

  if (structured) {
    for (const job of structured.employment) {
      items.push({
        id: `job-${job.company}-${job.title}`,
        kind: 'employment',
        title: job.title,
        subtitle: job.company,
        startDate: normalizeResumeDate(job.startDate),
        endDate: job.isCurrent ? null : normalizeResumeDate(job.endDate),
        source: 'resume',
      });
    }
    for (const edu of structured.education) {
      items.push({
        id: `edu-${edu.institution}`,
        kind: 'education',
        title: [edu.degree, edu.field].filter(Boolean).join(' in ') || 'Education',
        subtitle: edu.institution,
        startDate: normalizeResumeDate(edu.startDate),
        endDate: normalizeResumeDate(edu.endDate),
        source: 'resume',
      });
    }
    for (const gap of structured.employmentGaps ?? []) {
      items.push({
        id: `gap-${gap.startDate}`,
        kind: 'gap',
        title: 'Between jobs',
        subtitle: gap.label,
        startDate: gap.startDate,
        endDate: gap.endDate,
        source: 'inferred',
      });
    }
  }

  for (const ev of events) {
    items.push({
      id: ev.id,
      kind: 'event',
      title: ev.title,
      startDate: ev.start_time?.split('T')[0] ?? null,
      endDate: ev.end_time?.split('T')[0] ?? null,
      source: 'timeline',
    });
  }

  return items.sort((a, b) => {
    const da = a.startDate ?? '0000';
    const db = b.startDate ?? '0000';
    return db.localeCompare(da);
  });
}

class CareerSummaryService {
  async getSummary(userId: string): Promise<CareerSummary> {
    const [resumes, claims, skills, orgsResult, eventsResult] = await Promise.all([
      resumeParsingService.getResumeDocuments(userId).catch(() => []),
      profileClaimsService.getClaims(userId, { source: 'resume' }).catch(() => []),
      skillService.getSkills(userId, { active_only: true }).catch(() => []),
      supabaseAdmin
        .from('organizations')
        .select('id, name, status, metadata')
        .eq('user_id', userId)
        .in('type', ['company', 'other'])
        .order('updated_at', { ascending: false })
        .limit(20)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('resolved_events')
        .select('id, title, start_time, end_time, tags')
        .eq('user_id', userId)
        .contains('tags', ['resume'])
        .order('start_time', { ascending: false })
        .limit(30)
        .then((r) => r.data ?? [])
        .catch(() => []),
    ]);

    const latestResume = resumes[0] ?? null;
    let structured = latestResume ? pickStructured(latestResume) : null;

    if (structured && (!structured.employmentGaps?.length) && structured.employment.length > 1) {
      structured = {
        ...structured,
        employmentGaps: detectEmploymentGaps(structured.employment),
      };
    }

    const resumeSkillNames = new Set((structured?.skills ?? []).map((s) => s.toLowerCase()));
    const resumeFileId = latestResume
      ? (latestResume.parsed_data as { source_file_id?: string })?.source_file_id ?? null
      : null;

    const unverifiedClaims = claims.filter(
      (c) => !c.user_confirmed && c.verified_status === 'unverified'
    ).length;

    const employersFromResume = (orgsResult ?? []).filter(
      (o) => (o.metadata as Record<string, unknown>)?.source_file_id || (o.metadata as Record<string, unknown>)?.provenance === 'resume_lore_population'
    );

    return {
      generatedAt: new Date().toISOString(),
      hasResumeData: Boolean(structured?.employment?.length),
      currentRole: structured ? resolveCurrentRole(structured.employment) : null,
      contact: structured?.contact ?? {},
      employment: structured?.employment ?? [],
      education: structured?.education ?? [],
      employmentGaps: structured?.employmentGaps ?? [],
      skills: skills.slice(0, 25).map((s) => ({
        id: s.id,
        name: s.skill_name,
        category: s.skill_category,
        fromResume:
          resumeSkillNames.has(s.skill_name.toLowerCase()) ||
          Boolean((s.metadata as Record<string, unknown>)?.provenance === 'resume_lore_population'),
      })),
      employers: (employersFromResume.length ? employersFromResume : orgsResult ?? [])
        .slice(0, 10)
        .map((o) => ({ id: o.id, name: o.name, status: o.status })),
      timeline: buildTimeline(structured, eventsResult ?? []),
      stats: {
        jobCount: structured?.employment?.length ?? 0,
        schoolCount: structured?.education?.length ?? 0,
        skillCount: skills.length,
        employerCount: orgsResult?.length ?? 0,
        unverifiedClaims,
        resumeUploadCount: resumes.length,
        timelineEventCount: eventsResult?.length ?? 0,
      },
      latestResume: latestResume
        ? {
            documentId: latestResume.id,
            fileId: resumeFileId,
            fileName: latestResume.file_name,
            uploadedAt: latestResume.uploaded_at,
          }
        : null,
    };
  }
}

export const careerSummaryService = new CareerSummaryService();
