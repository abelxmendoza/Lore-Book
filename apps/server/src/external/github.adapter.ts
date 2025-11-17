import { ExternalEvent } from './types';

type GithubPayload = {
  commits?: { message: string; timestamp: string; url?: string }[];
  milestones?: { title: string; description?: string; closed_at?: string }[];
};

export function githubAdapter(payload: GithubPayload): ExternalEvent[] {
  const commitEvents = (payload.commits ?? []).map((commit) => ({
    source: 'github' as const,
    timestamp: commit.timestamp,
    type: 'commit',
    text: commit.message,
    tags: commit.url ? ['commit'] : [],
  }));

  const milestoneEvents = (payload.milestones ?? []).map((milestone) => ({
    source: 'github' as const,
    timestamp: milestone.closed_at ?? new Date().toISOString(),
    type: 'milestone',
    text: milestone.description ?? milestone.title,
    tags: ['milestone'],
  }));

  return [...commitEvents, ...milestoneEvents];
}
