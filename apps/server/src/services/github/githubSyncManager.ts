import { logger } from '../../logger';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';

import type { ClassifiedEvent } from './githubClassifier';
import { classifyEvents } from './githubClassifier';
import { githubClient, type RepoRef } from './githubClient';
import { filterNoise, type IngestableEvent, persistEvents } from './githubIngestion';
import { runPythonSummarizer, type MilestoneSummary } from './githubSummarizer';

export type GithubRepoRecord = { id: number; user_id: string; repo_name: string; repo_url: string };

const parseRepoUrl = (url: string): RepoRef => {
  const cleaned = url.replace('https://github.com/', '').replace('http://github.com/', '').replace(/\/$/, '');
  const [owner, name] = cleaned.split('/');
  if (!owner || !name) throw new Error('Invalid repository URL');
  return { owner, name };
};

const normalizeEvents = (activity: any[], commits: any[], prs: any[], releases: any[]): IngestableEvent[] => {
  const commitEvents = commits.map((commit) => ({
    type: 'commit',
    created_at: commit.commit?.author?.date,
    payload: {
      message: commit.commit?.message,
      files: commit.files?.map((f: any) => f.filename) ?? [],
      sha: commit.sha,
      author: commit.author?.login ?? commit.commit?.author?.name
    }
  }));

  const prEvents = prs.map((pr) => ({
    type: 'pull_request',
    created_at: pr.created_at,
    payload: {
      message: pr.title,
      files: pr.files?.map((f: any) => f.filename) ?? [],
      merged: pr.merged_at,
      additions: pr.additions,
      deletions: pr.deletions,
      author: pr.user?.login
    }
  }));

  const releaseEvents = releases.map((release) => ({
    type: 'release',
    created_at: release.created_at,
    payload: {
      message: release.name ?? release.tag_name,
      tag: release.tag_name,
      body: release.body
    }
  }));

  const activityEvents = activity.map((event) => ({
    type: event.type ?? 'activity',
    created_at: event.created_at,
    payload: event
  }));

  return [...commitEvents, ...prEvents, ...releaseEvents, ...activityEvents];
};

const detectMilestone = (events: ClassifiedEvent[]): MilestoneSummary => {
  const breakthroughEvents = events.filter((event) => event.classification === 'BREAKTHROUGH' || event.classification === 'MILESTONE');
  const seed = breakthroughEvents.length ? breakthroughEvents : events.slice(0, 5);
  return runPythonSummarizer(seed);
};

class GithubSyncManager {
  async linkRepo(userId: string, repoUrl: string): Promise<GithubRepoRecord> {
    const repoRef = parseRepoUrl(repoUrl);
    const repoName = `${repoRef.owner}/${repoRef.name}`;

    const { data: existing } = await supabaseAdmin
      .from('github_repos')
      .select('*')
      .eq('user_id', userId)
      .eq('repo_name', repoName)
      .maybeSingle();

    if (existing) return existing as GithubRepoRecord;

    const { data, error } = await supabaseAdmin
      .from('github_repos')
      .insert({ user_id: userId, repo_name: repoName, repo_url: repoUrl })
      .select()
      .single();

    if (error || !data) {
      logger.error({ error }, 'Failed to link GitHub repo');
      throw error ?? new Error('Unable to link repository');
    }

    return data as GithubRepoRecord;
  }

  async syncRepo(userId: string, repoUrl: string): Promise<{ milestone: MilestoneSummary; events: ClassifiedEvent[] }> {
    const repo = await this.linkRepo(userId, repoUrl);
    const ref = parseRepoUrl(repoUrl);

    const [activity, commits, prs, releases] = await Promise.all([
      githubClient.fetchRepoActivity(ref),
      githubClient.fetchCommits(ref),
      githubClient.fetchPRs(ref),
      githubClient.fetchReleases(ref)
    ]);

    const ingestable = normalizeEvents(activity, commits, prs, releases);
    const filtered = filterNoise(ingestable);
    const classified = classifyEvents(filtered);

    await persistEvents(repo.id, classified);

    const milestone = detectMilestone(classified);
    await this.persistMilestone(repo.id, milestone);
    await this.persistTimelineEvent(userId, repo.repo_name, milestone);

    return { milestone, events: classified };
  }

  private async persistMilestone(repoId: number, milestone: MilestoneSummary): Promise<void> {
    const { error } = await supabaseAdmin.from('github_milestones').insert({
      repo_id: repoId,
      summary: `${milestone.title}: ${milestone.summary}`,
      significance: milestone.significance,
      metadata: milestone.metadata
    });

    if (error) {
      logger.warn({ error }, 'Failed to persist milestone');
    }
  }

  private async persistTimelineEvent(userId: string, repoName: string, milestone: MilestoneSummary): Promise<void> {
    try {
      await memoryService.saveEntry({
        userId,
        content: milestone.summary,
        summary: milestone.title,
        tags: ['github', 'development', repoName],
        metadata: { source: 'github_milestone', repo: repoName, ...milestone.metadata }
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to persist timeline entry for milestone');
    }
  }

  async listSummaries(userId: string): Promise<{ repo: string; milestones: MilestoneSummary[] }[]> {
    const { data: repos } = await supabaseAdmin.from('github_repos').select('*').eq('user_id', userId);
    if (!repos?.length) return [];

    const repoIds = repos.map((repo) => repo.id);
    const { data: milestones } = await supabaseAdmin
      .from('github_milestones')
      .select('*')
      .in('repo_id', repoIds)
      .order('created_at', { ascending: false });

    const milestoneMap = new Map<number, MilestoneSummary[]>();
    milestones?.forEach((record) => {
      const list = milestoneMap.get(record.repo_id) ?? [];
      list.push({
        title: record.summary?.split(':')[0] ?? 'GitHub milestone',
        summary: record.summary ?? '',
        significance: record.significance ?? 0,
        metadata: record.metadata ?? {}
      });
      milestoneMap.set(record.repo_id, list);
    });

    return repos.map((repo) => ({ repo: repo.repo_name, milestones: milestoneMap.get(repo.id) ?? [] }));
  }
}

export const githubSyncManager = new GithubSyncManager();
