import { config } from '../../config';

export type RepoRef = { owner: string; name: string };
export type GithubEvent = { id?: string; type: string; payload: any; created_at?: string };

const BASE_URL = 'https://api.github.com';

class GithubClient {
  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Lore-Keeper-GitHub-Client'
    };
    if (config.githubToken) {
      headers.Authorization = `Bearer ${config.githubToken}`;
    }
    return headers;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, { headers: this.headers() });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed (${response.status}): ${text}`);
    }
    return (await response.json()) as T;
  }

  async fetchRepoActivity(repo: RepoRef): Promise<GithubEvent[]> {
    return this.fetchJson<GithubEvent[]>(`/repos/${repo.owner}/${repo.name}/events`);
  }

  async fetchCommits(repo: RepoRef): Promise<any[]> {
    return this.fetchJson<any[]>(`/repos/${repo.owner}/${repo.name}/commits`);
  }

  async fetchPRs(repo: RepoRef): Promise<any[]> {
    return this.fetchJson<any[]>(`/repos/${repo.owner}/${repo.name}/pulls?state=all`);
  }

  async fetchReleases(repo: RepoRef): Promise<any[]> {
    return this.fetchJson<any[]>(`/repos/${repo.owner}/${repo.name}/releases`);
  }

  async fetchContributors(repo: RepoRef): Promise<any[]> {
    return this.fetchJson<any[]>(`/repos/${repo.owner}/${repo.name}/contributors`);
  }
}

export const githubClient = new GithubClient();
