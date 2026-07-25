import type { ProjectCardData } from '../components/projects/ProjectProfileCard';
import type { ProjectDetailProfile } from '../components/projects/projectModalTypes';
import { formatMilestoneKind } from '../mocks/projectModalDemoData';

import { formatClipboardFields } from './listClipboard';

/** Minimum milestones/beats before we offer “Make LoreBook” from a project. */
export const PROJECT_LOREBOOK_MIN_BEATS = 3;

export function projectHasEnoughTimelineForLorebook(profile: ProjectDetailProfile): boolean {
  const beatCount =
    profile.milestones.length + profile.storyBeats.length + profile.decisions.length;
  return (
    profile.milestones.length >= PROJECT_LOREBOOK_MIN_BEATS ||
    beatCount >= 4 ||
    (profile.stats.momentCount ?? 0) >= 8
  );
}

/**
 * Plain-text export of a project's full timeline + story context.
 * Useful for correcting arcs in development or pasting into another LLM.
 */
export function buildProjectTimelineClipboardText(
  project: ProjectCardData,
  profile: ProjectDetailProfile,
): string {
  const milestones = [...profile.milestones].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const headerFields = formatClipboardFields([
    { label: 'Id', value: project.id },
    { label: 'Type', value: project.type },
    { label: 'Status', value: project.status },
    { label: 'Started', value: project.started_at },
    { label: 'Ended', value: project.ended_at },
    { label: 'Phase', value: profile.currentPhase },
    { label: 'Tagline', value: profile.tagline },
    { label: 'Tags', value: project.tags },
    { label: 'Moments', value: profile.stats.momentCount },
    { label: 'Threads', value: profile.stats.threadCount },
    { label: 'Days', value: profile.stats.dayCount },
  ]);

  const brief = [
    `What: ${profile.brief.what}`,
    `Why: ${profile.brief.why}`,
    `Current state: ${profile.brief.currentState}`,
    `Last activity: ${profile.brief.lastActivity}`,
    `Next step: ${profile.brief.nextStep}`,
    profile.brief.openQuestion ? `Open question: ${profile.brief.openQuestion}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const timelineBlocks = milestones.map((m, i) => {
    const meta = formatClipboardFields([
      { label: 'Kind', value: formatMilestoneKind(m.kind) },
      { label: 'Date', value: m.date.slice(0, 10) },
    ]);
    const summary = m.summary?.trim() ? `\n${m.summary.trim()}` : '';
    return `${i + 1}. ${m.title}\n${meta}${summary}`;
  });

  const decisionBlocks = profile.decisions.map((d, i) => {
    const meta = formatClipboardFields([
      { label: 'Date', value: d.date.slice(0, 10) },
      { label: 'Options', value: d.options },
      { label: 'Chosen', value: d.chosen },
      { label: 'Reason', value: d.reason },
    ]);
    return `${i + 1}. ${d.decision}\n${meta}`;
  });

  const storyBlocks = profile.storyBeats.map((b, i) => {
    const date = b.date ? `\nDate: ${b.date.slice(0, 10)}` : '';
    return `${i + 1}. ${b.title}${date}\n${b.body.trim()}`;
  });

  const people =
    profile.contributors.length > 0
      ? profile.contributors
          .map((c) => `- ${c.name} (${c.role}) · ${c.momentCount} moments`)
          .join('\n')
      : '(none)';

  const skills =
    profile.skills.length > 0
      ? profile.skills.map((s) => `- ${s.name}${s.level ? ` · ${s.level}` : ''}`).join('\n')
      : '(none)';

  const sections = [
    `Project Timeline — ${project.name}`,
    headerFields,
    project.summary?.trim() || project.description?.trim()
      ? `\nSummary\n${(project.summary || project.description || '').trim()}`
      : '',
    profile.purpose?.trim() ? `\nPurpose\n${profile.purpose.trim()}` : '',
    `\nBrief\n${brief}`,
    `\nTimeline (${milestones.length} milestone${milestones.length === 1 ? '' : 's'})\n${
      timelineBlocks.length ? timelineBlocks.join('\n\n') : '(empty)'
    }`,
    decisionBlocks.length
      ? `\nDecisions (${decisionBlocks.length})\n${decisionBlocks.join('\n\n')}`
      : '',
    storyBlocks.length
      ? `\nStory beats (${storyBlocks.length})\n${storyBlocks.join('\n\n')}`
      : '',
    `\nPeople\n${people}`,
    `\nSkills\n${skills}`,
    profile.openLoops.length
      ? `\nOpen loops\n${profile.openLoops.map((l) => `- ${l}`).join('\n')}`
      : '',
  ];

  return sections.filter((s) => s && String(s).trim()).join('\n').trim() + '\n';
}

export function buildProjectOmniTimelineSearchQuery(project: ProjectCardData): string {
  const name = project.name?.trim();
  if (!name) return 'project';
  return name;
}
