/**
 * Story-driven skill content for demo mode — evidence, narrative beats, activity, memories.
 */
import { format, subDays, subMonths } from 'date-fns';
import type { Skill, SkillMetadata, SkillProgress } from '../types/skill';
import type { SkillProfile } from '../lib/skillProfile';
import { readSkillProfile } from '../lib/skillProfile';
import {
  buildStorySummary,
  computeEvidenceScore,
  computeProficiencyBreakdown,
  type SkillActivityBucket,
  type SkillEvidenceItem,
  type SkillMemoryItem,
  type SkillStoryBeat,
} from '../lib/skillStory';

export function getSkillStoryNarrative(skill: Skill, details?: SkillMetadata | null): string {
  const profile = readSkillProfile(skill.metadata);
  const beats = getSkillStoryBeats(skill, details);
  const project = profile?.related_projects?.[0];
  const arc = details?.arcs?.[0]?.arc_title;

  if (skill.skill_name.toLowerCase().includes('ros')) {
    return `Your robotics journey began through ${project ?? 'Omega-1'}. ${skill.skill_name} evolved from an experimental skill into a core professional competency used in personal projects and job interviews.`;
  }

  const opening = buildStorySummary(skill, profile, details);
  const middle =
    beats.length > 2
      ? ` It moved from ${beats[beats.length - 1]?.title.toLowerCase()} to ${beats[0]?.title.toLowerCase()}.`
      : '';
  const arcBit = arc ? ` This arc ties into ${arc}.` : '';
  return `${opening}${middle}${arcBit}`;
}

export function getSkillStoryBeats(skill: Skill, details?: SkillMetadata | null): SkillStoryBeat[] {
  const profile = readSkillProfile(skill.metadata);
  const beats: SkillStoryBeat[] = [];

  if (details?.learning_timeline?.length) {
    for (const entry of details.learning_timeline) {
      beats.push({
        id: `lt-${entry.entry_id}`,
        date: entry.date,
        title: entry.event,
        kind: 'milestone',
      });
    }
  }

  if (details?.why_started) {
    beats.push({
      id: `why-${skill.id}`,
      date: details.why_started.extracted_at ?? skill.first_mentioned_at,
      title: `Started learning ${skill.skill_name}`,
      description: details.why_started.reason,
      kind: 'start',
    });
  } else {
    beats.push({
      id: `first-${skill.id}`,
      date: skill.first_mentioned_at,
      title: `First mention of ${skill.skill_name}`,
      description: skill.description ?? undefined,
      kind: 'start',
    });
  }

  for (const project of profile?.related_projects ?? []) {
    beats.push({
      id: `proj-${project}`,
      date: subMonths(new Date(skill.first_mentioned_at), -3).toISOString(),
      title: `Built ${project}`,
      kind: 'project',
    });
  }

  if (skill.last_practiced_at) {
    beats.push({
      id: `recent-${skill.id}`,
      date: skill.last_practiced_at,
      title: `Discussed ${skill.skill_name} recently`,
      description: `${skill.practice_count} total conversations logged.`,
      kind: 'practice',
    });
  }

  const monthMentions = Math.max(3, Math.round(skill.practice_count * 0.12));
  beats.push({
    id: `month-${skill.id}`,
    date: new Date().toISOString(),
    title: `Discussed ${skill.skill_name} ${monthMentions} times this month`,
    kind: 'insight',
  });

  return beats.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getSkillEvidenceItems(skill: Skill): SkillEvidenceItem[] {
  const profile = readSkillProfile(skill.metadata);
  const fromProfile = (profile?.evidence ?? []).map((e, i) => ({
    id: `ev-${skill.id}-${i}`,
    source_type: (e.source_type as SkillEvidenceItem['source_type']) ?? 'chat',
    title: e.source_type === 'chat' ? 'Chat mention' : 'Evidence',
    excerpt: e.text,
    date: e.captured_at ?? skill.updated_at,
    confidence_delta: Math.round((e.confidence ?? 0.08) * 100),
  }));

  if (fromProfile.length > 0) return fromProfile;

  const items: SkillEvidenceItem[] = [
    {
      id: `ev-chat-${skill.id}`,
      source_type: 'chat',
      title: 'Chat mention',
      excerpt: `"I've been working with ${skill.skill_name} on recent projects."`,
      date: skill.last_practiced_at ?? skill.updated_at,
      confidence_delta: 8,
    },
  ];

  for (const project of profile?.related_projects ?? []) {
    items.push({
      id: `ev-proj-${project}`,
      source_type: 'project',
      title: `${project} repository`,
      excerpt: `Contains references, configs, and artifacts linked to ${skill.skill_name}.`,
      date: subDays(new Date(), 45).toISOString(),
      confidence_delta: 15,
    });
  }

  if (skill.description) {
    items.push({
      id: `ev-note-${skill.id}`,
      source_type: 'note',
      title: 'Skill description',
      excerpt: skill.description,
      date: skill.first_mentioned_at,
      confidence_delta: 5,
    });
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getSkillGrowthTimeline(skill: Skill): Array<{ date: string; label: string; level: string }> {
  const start = new Date(skill.first_mentioned_at);
  const points = [
    { offsetMonths: 0, level: 'Beginner' },
    { offsetMonths: 4, level: 'Intermediate' },
    { offsetMonths: 10, level: 'Advanced' },
    { offsetMonths: 18, level: skill.current_level >= 12 ? 'Expert' : 'Advanced+' },
  ];

  return points.map((p) => ({
    date: format(subMonths(start, -p.offsetMonths), 'MMM yyyy'),
    label: p.level,
    level: p.level,
  }));
}

export function getSkillActivityBuckets(skill: Skill): SkillActivityBucket[] {
  const week = Math.max(1, Math.round(skill.practice_count * 0.04));
  const month = Math.max(week + 2, Math.round(skill.practice_count * 0.18));
  const year = Math.max(month + 10, skill.practice_count);

  return [
    {
      label: 'Last 7 days',
      count: week,
      categories: [
        { label: 'Discussed', count: Math.round(week * 0.6) },
        { label: 'Practiced', count: Math.round(week * 0.3) },
        { label: 'Taught', count: Math.max(0, week - 8) },
      ],
    },
    {
      label: 'Last 30 days',
      count: month,
      categories: [
        { label: 'Discussed', count: Math.round(month * 0.55) },
        { label: 'Practiced', count: Math.round(month * 0.35) },
        { label: 'Used professionally', count: Math.round(month * 0.1) },
      ],
    },
    {
      label: 'Last year',
      count: year,
      categories: [
        { label: 'Discussed', count: Math.round(year * 0.5) },
        { label: 'Practiced', count: Math.round(year * 0.35) },
        { label: 'Used professionally', count: Math.round(year * 0.15) },
      ],
    },
  ];
}

export function getSkillMemories(skill: Skill): SkillMemoryItem[] {
  const now = new Date();
  const snippets = [
    `Discussed ${skill.skill_name} architecture`,
    `Talked about applying ${skill.skill_name} in a project`,
    `Interview prep mentioning ${skill.skill_name}`,
    `Compared ${skill.skill_name} with related tools`,
  ];

  return snippets.slice(0, 4).map((summary, i) => ({
    id: `mem-${skill.id}-${i}`,
    date: subDays(now, (i + 1) * 3).toISOString(),
    summary,
    source_type: i === 2 ? 'chat' : 'journal',
  }));
}

export function getSkillAiInsights(skill: Skill, profile?: SkillProfile): string[] {
  if (profile?.ai_insights?.length) return profile.ai_insights;

  const related = profile?.related_skill_names?.slice(0, 3).join(', ');
  return [
    `${skill.skill_name} appears to be one of your stronger ${skill.skill_category} identities.`,
    related
      ? `It frequently appears alongside ${related}.`
      : 'Related skills cluster around your active projects and career threads.',
    profile?.trajectory === 'improving'
      ? `${skill.skill_category}-related skills have steadily increased in your story.`
      : 'Usage has remained stable — still a reliable part of your lore.',
    profile?.related_projects?.length
      ? `Most project work connects through ${profile.related_projects.slice(0, 2).join(' and ')}.`
      : 'Career conversations often reference this skill when planning next steps.',
  ];
}

export function getSkillPortfolioItems(skill: Skill) {
  const profile = readSkillProfile(skill.metadata);
  const projects = profile?.related_projects ?? [];
  const jobs = profile?.related_jobs ?? [];

  return [
    ...projects.map((name) => ({
      id: `port-proj-${name}`,
      kind: 'project' as const,
      title: name,
      subtitle: 'Project',
      skills: [skill.skill_name, ...(profile?.related_skill_names?.slice(0, 2) ?? [])],
    })),
    ...jobs.map((name) => ({
      id: `port-job-${name}`,
      kind: 'work' as const,
      title: name,
      subtitle: 'Work context',
      skills: [skill.skill_name],
    })),
  ];
}

export function getSkillMetaDump(skill: Skill) {
  const profile = readSkillProfile(skill.metadata);
  return {
    skill_id: skill.id,
    confidence_score: skill.confidence_score,
    evidence_score: computeEvidenceScore(skill, profile),
    proficiency_breakdown: computeProficiencyBreakdown(skill, profile),
    auto_detected: skill.auto_detected,
    metadata_keys: Object.keys(skill.metadata ?? {}),
    parent_skill_ids: (skill.metadata?.parent_skill_ids as string[] | undefined) ?? [],
    skill_history_count: Array.isArray(skill.metadata?.skill_history)
      ? (skill.metadata.skill_history as unknown[]).length
      : 0,
  };
}

export function enrichSkillProfileForStory(skill: Skill): Skill {
  const profile = readSkillProfile(skill.metadata);
  const details = skill.metadata?.skill_details as SkillMetadata | undefined;
  const evidence = getSkillEvidenceItems(skill);
  const breakdown = computeProficiencyBreakdown(skill, profile);

  const enrichedProfile: SkillProfile = {
    skill_type: profile?.skill_type ?? 'technical',
    monetization: profile?.monetization ?? 'potentially_paid',
    proficiency: profile?.proficiency ?? breakdown.knowledge,
    enjoyment: profile?.enjoyment ?? 70,
    usage_frequency: profile?.usage_frequency ?? 'weekly',
    trajectory: profile?.trajectory ?? 'improving',
    ...profile,
    story_summary: profile?.story_summary ?? buildStorySummary(skill, profile, details),
    evidence_score: profile?.evidence_score ?? computeEvidenceScore(skill, profile),
    proficiency_breakdown: profile?.proficiency_breakdown ?? breakdown,
    evidence: profile?.evidence?.length ? profile.evidence : evidence.map((e) => ({
      text: e.excerpt,
      source_type: e.source_type,
      confidence: (e.confidence_delta ?? 8) / 100,
      captured_at: e.date,
    })),
    ai_insights: profile?.ai_insights ?? getSkillAiInsights(skill, profile),
  };

  return {
    ...skill,
    metadata: {
      ...skill.metadata,
      skill_profile: enrichedProfile,
    },
  };
}

export function getSkillLevelProgressHistory(skill: Skill, progress: SkillProgress[]) {
  if (progress.length >= 3) {
    return progress.slice(0, 6).map((p) => ({
      date: p.timestamp,
      label: `+${p.xp_gained} XP`,
      notes: p.notes,
    }));
  }
  return getSkillGrowthTimeline(skill).map((p) => ({
    date: p.date,
    label: p.label,
    notes: undefined as string | undefined,
  }));
}
