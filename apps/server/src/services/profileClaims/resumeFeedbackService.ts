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

export type ResumeChatFeedback = {
  chatFeedback: string;
  careerTimeline: CareerTimelineEntry[];
  educationTimeline: EducationTimelineEntry[];
  savedToLibrary: boolean;
  userFileId?: string;
};

function formatRange(start: string | null, end: string | null, isCurrent?: boolean): string {
  const s = start ? new Date(start).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '?';
  const e = isCurrent ? 'Present' : end ? new Date(end).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '?';
  return `${s} – ${e}`;
}

export function buildResumeTimelines(parsed: ParsedResume): {
  careerTimeline: CareerTimelineEntry[];
  educationTimeline: EducationTimelineEntry[];
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

  return { careerTimeline, educationTimeline };
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
  const { careerTimeline, educationTimeline } = buildResumeTimelines(parsed);
  const name = parsed.contact.fullName?.trim() || 'you';

  const careerLines = careerTimeline.map(
    (j) => `• **${j.title}** at ${j.company} (${formatRange(j.startDate, j.endDate, j.isCurrent)})`
  );
  const eduLines = educationTimeline.map((e) => {
    const label = [e.degree, e.institution].filter(Boolean).join(' — ');
    return `• ${label} (${formatRange(e.startDate, e.endDate)})`;
  });

  const skillPreview = parsed.skills.slice(0, 8).join(', ');
  const projectPreview = parsed.projects.slice(0, 3).map((p) => p.name).join(', ');

  const sections: string[] = [
    `I've read **${fileName}** and saved it to your **Documents library** and **memory**.`,
    '',
    `**${name}** — this is now part of your lore: career claims, skills, contact, and your **main character** profile are updating.`,
    '',
    '### How your timelines are organized',
    '',
    '**Career track** (Omni Timeline → Events / Swimlanes): each job becomes a dated **resolved event** and journal entry on the **career** lane. Stories you add about RLH, Vanguard, Serve Robotics, etc. can be tagged to those date ranges.',
    '',
    '**Education track**: each school is a dated **education** event. Memories from college or coursework attach to that window so you can browse “CSU Fullerton era” vs “Rio Hondo coursework” separately.',
    '',
    '**Life Log + Chat**: resume facts also land as searchable journal entries with `resume` tags — anything you tell me about those periods cross-links automatically.',
    '',
  ];

  if (careerLines.length > 0) {
    sections.push('### Career timeline', '', ...careerLines, '');
  }
  if (eduLines.length > 0) {
    sections.push('### Education timeline', '', ...eduLines, '');
  }
  if (skillPreview) {
    sections.push(`**Skills detected:** ${skillPreview}${parsed.skills.length > 8 ? '…' : ''}`, '');
  }
  if (projectPreview) {
    sections.push(`**Projects:** ${projectPreview}`, '');
  }

  sections.push(
    '**Saved to memory:**',
    `• ${counts.journalEntries} lore entries`,
    `• ${counts.timelineEvents} timeline events`,
    `• ${counts.claims} profile claims (review in Documents → Claims)`,
    `• ${counts.skills} skills · ${counts.organizations} employers`,
    counts.characterAttributes > 0
      ? `• ${counts.characterAttributes} attributes on your main character card`
      : '',
    '',
    parsed.summary
      ? `**Career snapshot:** ${parsed.summary.slice(0, 280)}${parsed.summary.length > 280 ? '…' : ''}`
      : '',
    '',
    'Ask me about any job, school, or skill — I’ll use this timeline when answering.'
  );

  const chatFeedback = sections.filter((line) => line !== '').join('\n');

  return {
    chatFeedback,
    careerTimeline,
    educationTimeline,
    savedToLibrary: true,
    userFileId,
  };
}
