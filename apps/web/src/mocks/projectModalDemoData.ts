import { subDays, subMonths, format, differenceInDays } from 'date-fns';
import type { ProjectCardData } from '../components/projects/ProjectProfileCard';
import type {
  EnrichedProject,
  ProjectDecision,
  ProjectDetailProfile,
  ProjectMilestone,
  ProjectStoryBeat,
} from '../components/projects/projectModalTypes';

const LOREBOOK_PROFILE: ProjectDetailProfile = {
  purpose: 'Building the biographer you wish ChatGPT was — persistent memory across chat, books, and timeline.',
  tagline: 'Personal knowledge system with a living lore graph',
  currentPhase: 'Memory integration & agent orchestration',
  brief: {
    what: 'Life-memory app: chat-first ingestion, entity books, family graphs, and project arcs.',
    why: 'You want software that remembers your life, not just chats — and surfaces it when it matters.',
    currentState: 'Lore agents, Redux chat, and project books shipping; ingestion pipeline maturing.',
    lastActivity: 'Project modal redesign · today',
    nextStep: 'Derived project context from chat + milestone auto-detection when status changes.',
    openQuestion: 'How to unify Life Log, Events, and Memories without overwhelming the sidebar?',
  },
  stats: { momentCount: 47, threadCount: 12, dayCount: 420, lastActiveLabel: '2 hours ago' },
  milestones: [
    { id: 'lb-1', title: 'Project kickoff', date: subMonths(new Date(), 14).toISOString(), kind: 'start', summary: 'Named LoreBook and scoped the memory graph vision.' },
    { id: 'lb-2', title: 'First biography generation', date: subMonths(new Date(), 8).toISOString(), kind: 'breakthrough', summary: 'End-to-end chat → entity → timeline loop worked.' },
    { id: 'lb-3', title: 'Entity integrity sprint', date: subMonths(new Date(), 3).toISOString(), kind: 'milestone', summary: 'Kinship glossary + anti-pollution guards landed.' },
    { id: 'lb-4', title: 'Lore agents layer', date: subDays(new Date(), 21).toISOString(), kind: 'milestone', summary: 'Memory, identity, and narrative agents propose — never mutate.' },
    { id: 'lb-5', title: 'Project experience v2', date: subDays(new Date(), 1).toISOString(), kind: 'milestone', summary: 'Rich project modals for effort arcs and milestones.' },
  ],
  contributors: [
    { id: 'c-sloane', name: 'Sloane', role: 'Co-builder & design partner', momentCount: 18, lastActive: subDays(new Date(), 2).toISOString() },
    { id: 'c-ash', name: 'Ashley', role: 'Early tester & feedback', momentCount: 7, lastActive: subMonths(new Date(), 1).toISOString() },
    { id: 'c-casey', name: 'Casey', role: 'Onboarding critique', momentCount: 3, lastActive: subMonths(new Date(), 2).toISOString() },
  ],
  skills: [
    { id: 's-ts', name: 'TypeScript', level: 'Advanced' },
    { id: 's-react', name: 'React', level: 'Advanced' },
    { id: 's-pg', name: 'PostgreSQL', level: 'Intermediate' },
    { id: 's-ai', name: 'LLM orchestration', level: 'Growing' },
    { id: 's-ux', name: 'Product design', level: 'Intermediate' },
  ],
  resources: [
    { id: 'r-arch', title: 'Architecture consolidation report', kind: 'doc' },
    { id: 'r-spec', title: 'project-experience-v2.md', kind: 'file' },
    { id: 'r-thread', title: 'WMA integration sprint thread', kind: 'thread' },
    { id: 'r-figma', title: 'LoreBook mobile shell mockups', kind: 'link', url: '#' },
  ],
  decisions: [
    {
      id: 'd-wma',
      decision: 'Primary retrieval architecture',
      date: subDays(new Date(), 45).toISOString(),
      options: 'Patch recall routers / new WMA / hybrid flag',
      chosen: 'WMA primary with legacy fallback flag',
      reason: 'Eliminate retrieval sprawl; one path for chat memory.',
    },
    {
      id: 'd-redux',
      decision: 'Client state for chat threads',
      date: subDays(new Date(), 30).toISOString(),
      options: 'Context-only / Redux + RTK Query / Zustand',
      chosen: 'Redux slice + RTK Query for server state',
      reason: 'Cross-surface selection and thread durability.',
    },
  ],
  storyBeats: [
    {
      id: 'st-1',
      title: 'Why this exists',
      date: subMonths(new Date(), 14).toISOString(),
      body: 'Frustration with stateless AI led to a bet: your story should compound every time you talk to LoreBook.',
    },
    {
      id: 'st-2',
      title: 'The pivot to books',
      date: subMonths(new Date(), 10).toISOString(),
      body: 'Characters and locations became first-class “books” — projects were the missing third pillar for long-running efforts.',
    },
    {
      id: 'st-3',
      title: 'Shipping under real use',
      date: subMonths(new Date(), 4).toISOString(),
      body: 'Dogfooding daily chat surfaced thread hydration bugs and the need for project lifecycle states (active, paused, abandoned).',
    },
  ],
  locations: [
    { id: 'loc-home', name: 'Home office' },
    { id: 'loc-cafe', name: 'Corner café (deep work)' },
  ],
  openLoops: [
    'Auto-detect when you stop mentioning a project → suggest paused or abandoned.',
    'Link resume-imported projects to live chat threads.',
    'Surface project decisions when similar choices appear in chat.',
  ],
};

function milestoneIcon(kind: ProjectMilestone['kind']): string {
  const map: Record<ProjectMilestone['kind'], string> = {
    milestone: '★',
    pivot: '↻',
    pause: '⏸',
    breakthrough: '✦',
    start: '▶',
    end: '■',
  };
  return map[kind];
}

export function formatMilestoneKind(kind: ProjectMilestone['kind']): string {
  return `${milestoneIcon(kind)} ${kind.replace('_', ' ')}`;
}

function inferDates(project: ProjectCardData): { started: Date; ended: Date | null } {
  const updated = new Date(project.updated_at);
  const status = (project.status ?? 'active').toLowerCase();
  const started = project.started_at ? new Date(project.started_at) : subMonths(updated, 4 + (project.name.length % 8));
  let ended: Date | null = null;
  if (status === 'completed') ended = project.ended_at ? new Date(project.ended_at) : subDays(updated, 14);
  if (status === 'abandoned') ended = project.ended_at ? new Date(project.ended_at) : subMonths(updated, 2);
  return { started, ended };
}

function buildGenericDemoProfile(project: ProjectCardData): ProjectDetailProfile {
  const { started, ended } = inferDates(project);
  const status = (project.status ?? 'active').toLowerCase();
  const dayCount = Math.max(1, differenceInDays(ended ?? new Date(), started));
  const typeLabel = project.type?.replace(/_/g, ' ') ?? 'project';
  const desc = project.description ?? `Your ${typeLabel} effort tracked in LoreBook.`;

  const phaseByStatus: Record<string, string> = {
    active: 'In progress',
    paused: 'On hold — pick up when ready',
    completed: 'Wrapped — outcomes captured',
    abandoned: 'Shelved — learnings kept',
  };

  const milestones: ProjectMilestone[] = [
    { id: 'm-start', title: 'Started', date: started.toISOString(), kind: 'start', summary: `You named "${project.name}" and began tracking it.` },
  ];

  if (status === 'paused') {
    milestones.push({
      id: 'm-pause',
      title: 'Paused',
      date: subDays(new Date(project.updated_at), 7).toISOString(),
      kind: 'pause',
      summary: 'Activity dropped — LoreBook marked this as on hold.',
    });
  }
  if (status === 'completed' && ended) {
    milestones.push({
      id: 'm-done',
      title: 'Completed',
      date: ended.toISOString(),
      kind: 'end',
      summary: 'You marked this effort done — milestones and story preserved.',
    });
  }
  if (status === 'abandoned' && ended) {
    milestones.push({
      id: 'm-left',
      title: 'Stepped away',
      date: ended.toISOString(),
      kind: 'pivot',
      summary: 'You moved on — LoreBook keeps the arc so you can revisit why.',
    });
  }

  milestones.push({
    id: 'm-recent',
    title: 'Last mentioned in chat',
    date: project.updated_at,
    kind: 'milestone',
    summary: 'Most recent signal from your conversations.',
  });

  const storyBeats: ProjectStoryBeat[] = [
    { id: 'sb-1', title: 'Origin', date: started.toISOString(), body: desc },
    {
      id: 'sb-2',
      title: 'Where things stand',
      date: project.updated_at,
      body:
        status === 'active'
          ? `Still active — ${dayCount} days in. LoreBook will surface this when you talk about ${project.name}.`
          : status === 'paused'
            ? `Paused after ${dayCount} days. Mention it again in chat to resume tracking.`
            : status === 'completed'
              ? `Finished after ${dayCount} days. Accomplishments stay linked to this project.`
              : `Abandoned after ${dayCount} days. The story remains — nothing is deleted.`,
    },
  ];

  const decisions: ProjectDecision[] =
    status === 'active'
      ? [
          {
            id: 'd-scope',
            decision: 'Scope for the next stretch',
            date: subDays(new Date(project.updated_at), 20).toISOString(),
            chosen: 'Focus on one measurable outcome',
            reason: 'Inferred from how you talk about priorities in chat.',
          },
        ]
      : [];

  return {
    purpose: desc.slice(0, 120),
    tagline: `${typeLabel} · ${phaseByStatus[status] ?? 'Tracked'}`,
    currentPhase: phaseByStatus[status] ?? 'In progress',
    brief: {
      what: desc,
      why: `This ${typeLabel} matters enough that you keep mentioning it in your lore.`,
      currentState: phaseByStatus[status] ?? 'Active',
      lastActivity: format(new Date(project.updated_at), 'MMM d, yyyy'),
      nextStep:
        status === 'active'
          ? 'Talk about progress in chat — LoreBook updates milestones automatically.'
          : status === 'paused'
            ? 'Open chat and say you are picking this back up.'
            : 'Review the timeline and capture any final notes.',
      openQuestion: status === 'abandoned' ? 'Would you revisit this if circumstances changed?' : undefined,
    },
    stats: {
      momentCount: 3 + (project.name.length % 12),
      threadCount: 1 + (project.tags?.length ?? 0),
      dayCount,
      lastActiveLabel: format(new Date(project.updated_at), 'MMM d'),
    },
    milestones,
    contributors: [
      { id: 'you', name: 'You', role: 'Owner', momentCount: milestones.length, lastActive: project.updated_at },
    ],
    skills: (project.tags ?? []).slice(0, 5).map((t, i) => ({ id: `sk-${i}`, name: t, level: 'Practicing' })),
    resources: [
      { id: 'res-chat', title: `Chat threads mentioning "${project.name}"`, kind: 'thread' },
      ...(project.tags?.[0]
        ? [{ id: 'res-tag', title: `Notes tagged ${project.tags[0]}`, kind: 'doc' as const }]
        : []),
    ],
    decisions,
    storyBeats,
    locations: [],
    openLoops:
      status === 'active'
        ? ['Capture the next milestone when you hit it in chat.']
        : status === 'paused'
          ? ['Set a date to revisit — or tell LoreBook you are resuming.']
          : [],
  };
}

export function getProjectDetailProfile(project: ProjectCardData, demo: boolean): ProjectDetailProfile {
  if (!demo) return buildGenericDemoProfile(project);
  if (project.name.toLowerCase().includes('lorebook')) return LOREBOOK_PROFILE;
  return buildGenericDemoProfile(project);
}

export function enrichProjectForDemo(project: ProjectCardData): EnrichedProject {
  const { started, ended } = inferDates(project);
  const profile = getProjectDetailProfile(project, true);
  return {
    ...project,
    started_at: project.started_at ?? started.toISOString(),
    ended_at: project.ended_at ?? (ended ? ended.toISOString() : null),
    summary: profile.purpose,
    importance_score: project.name.toLowerCase().includes('lorebook') ? 95 : 40 + (project.name.length % 40),
  };
}
