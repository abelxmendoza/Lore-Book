/**
 * Builds chat-facing feedback after resume ingestion — lore summary + timeline organization.
 */
import type { ParsedResume } from '../profileClaims/resumeStructuredTypes';
import { normalizeResumeDate } from '../profileClaims/resumeDateUtils';

export type CareerTimelineEntry = {
  kind: 'employment';
  title: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  track: 'career';
};

export type EducationTimelineEntry = {
  kind: 'education';
  institution: string;
  degree?: string;
  startDate: string | null;
  endDate: string | null;
  track: 'education';
};

export type ProjectTimelineEntry = {
  kind: 'project';
  name: string;
  startDate: string | null;
  endDate: string | null;
  track: 'projects';
};

export type CertificationTimelineEntry = {
  kind: 'certification';
  name: string;
  issuer?: string;
  date: string | null;
  track: 'education';
};

export type ResumeChatFeedback = {
  chatFeedback: string;
  careerTimeline: CareerTimelineEntry[];
  educationTimeline: EducationTimelineEntry[];
  projectTimeline: ProjectTimelineEntry[];
  certificationTimeline: CertificationTimelineEntry[];
  savedToLibrary: boolean;
  userFileId?: string;
};

function formatRange(start: string | null, end: string | null, isCurrent?: boolean): string {
  const s = start
    ? new Date(start).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : 'Date not stated';
  const e = isCurrent
    ? 'Present'
    : end
      ? new Date(end).toLocaleDateString(undefined, {
          month: 'short',
          year: 'numeric',
        })
      : 'End date not stated';
  return `${s} – ${e}`;
}

export function buildResumeTimelines(parsed: ParsedResume): {
  careerTimeline: CareerTimelineEntry[];
  educationTimeline: EducationTimelineEntry[];
  projectTimeline: ProjectTimelineEntry[];
  certificationTimeline: CertificationTimelineEntry[];
} {
  const careerTimeline: CareerTimelineEntry[] = parsed.employment
    .map((job) => ({
      kind: 'employment' as const,
      title: job.title,
      company: job.company,
      startDate: normalizeResumeDate(job.startDate),
      endDate: job.isCurrent ? null : normalizeResumeDate(job.endDate),
      isCurrent: Boolean(job.isCurrent),
      track: 'career' as const,
    }))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));

  const educationTimeline: EducationTimelineEntry[] = parsed.education
    .map((edu) => ({
      kind: 'education' as const,
      institution: edu.institution,
      degree: edu.degree,
      startDate: normalizeResumeDate(edu.startDate),
      endDate: normalizeResumeDate(edu.endDate),
      track: 'education' as const,
    }))
    .sort((a, b) => (a.startDate ?? a.endDate ?? '').localeCompare(b.startDate ?? b.endDate ?? ''));

  const projectTimeline: ProjectTimelineEntry[] = parsed.projects
    .map((project) => ({
      kind: 'project' as const,
      name: project.name,
      startDate: normalizeResumeDate(project.startDate),
      endDate: normalizeResumeDate(project.endDate),
      track: 'projects' as const,
    }))
    .sort((a, b) => (a.startDate ?? a.endDate ?? '').localeCompare(b.startDate ?? b.endDate ?? ''));

  const certificationTimeline: CertificationTimelineEntry[] = parsed.certifications
    .map((certification) => ({
      kind: 'certification' as const,
      name: certification.name,
      issuer: certification.issuer,
      date: normalizeResumeDate(certification.date),
      track: 'education' as const,
    }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  return {
    careerTimeline,
    educationTimeline,
    projectTimeline,
    certificationTimeline,
  };
}

export function buildResumeChatFeedback(params: {
  parsed: ParsedResume;
  fileName: string;
  userFileId?: string;
  counts: {
    claims: number;
    journalEntries: number;
    timelineEvents: number;
    skills: number;
    organizations: number;
    characterAttributes: number;
  };
}): ResumeChatFeedback {
  const { parsed, fileName, userFileId, counts } = params;
  const { careerTimeline, educationTimeline, projectTimeline, certificationTimeline } = buildResumeTimelines(parsed);
  const name = parsed.contact.fullName?.trim() || 'you';

  const careerLines = careerTimeline.map(
    (j) => `• **${j.title}** at ${j.company} (${formatRange(j.startDate, j.endDate, j.isCurrent)})`
  );
  const eduLines = educationTimeline.map((e) => {
    const label = [e.degree, e.institution].filter(Boolean).join(' — ');
    return `• ${label} (${formatRange(e.startDate, e.endDate)})`;
  });
  const projectLines = projectTimeline.map(
    (project) => `• **${project.name}** (${formatRange(project.startDate, project.endDate)})`
  );
  const certificationLines = certificationTimeline.map(
    (certification) =>
      `• **${certification.name}**${certification.issuer ? ` — ${certification.issuer}` : ''} (${certification.date ? formatRange(certification.date, certification.date) : 'Date unknown'})`
  );

  const skillPreview = parsed.skills.slice(0, 8).join(', ');
  const projectPreview = parsed.projects
    .slice(0, 3)
    .map((p) => p.name)
    .join(', ');

  const sections: string[] = [
    `I've read **${fileName}** and saved it to your **Documents library**.`,
    '',
    `**${name}** — I extracted career, education, project, skill, contact, and profile evidence. These items are staged for your review before they become confirmed memory.`,
    '',
    '### How your timelines are organized',
    '',
    '**Career track**: dated jobs and employment gaps are staged as reviewable events labeled **Career**.',
    '',
    '**Education track**: dated schools and certifications are staged as reviewable events labeled **Education**.',
    '',
    '**Projects track**: dated projects are staged as reviewable events labeled **Projects**. Undated projects stay searchable without inventing a date.',
    '',
    '**Life Log + Chat**: the original resume evidence is searchable with `resume` tags; confirm claims before relying on them as fact.',
    '',
  ];

  if (careerLines.length > 0) {
    sections.push('### Career timeline', '', ...careerLines, '');
  }
  if (eduLines.length > 0) {
    sections.push('### Education timeline', '', ...eduLines, '');
  }
  if (projectLines.length > 0) {
    sections.push('### Projects timeline', '', ...projectLines, '');
  }
  if (certificationLines.length > 0) {
    sections.push('### Certifications', '', ...certificationLines, '');
  }
  if (skillPreview) {
    sections.push(`**Skills detected:** ${skillPreview}${parsed.skills.length > 8 ? '…' : ''}`, '');
  }
  if (projectPreview) {
    sections.push(`**Projects:** ${projectPreview}`, '');
  }

  sections.push(
    '**Staged for review:**',
    `• ${counts.journalEntries} evidence entries`,
    `• ${counts.timelineEvents} timeline items`,
    `• ${counts.claims} profile claims (review in Documents → Claims)`,
    `• ${counts.skills} skills · ${counts.organizations} employers`,
    counts.characterAttributes > 0 ? `• ${counts.characterAttributes} profile attributes` : '',
    '',
    parsed.summary
      ? `**Career snapshot:** ${parsed.summary.slice(0, 280)}${parsed.summary.length > 280 ? '…' : ''}`
      : '',
    '',
    '[Open Timeline](/timeline?view=events) · [Open Calendar](/timeline?view=calendar)',
    '',
    'Ask me about any job, school, or skill — I’ll use this timeline when answering.'
  );

  const chatFeedback = sections.filter((line) => line !== '').join('\n');

  return {
    chatFeedback,
    careerTimeline,
    educationTimeline,
    projectTimeline,
    certificationTimeline,
    savedToLibrary: true,
    userFileId,
  };
}
