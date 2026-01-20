import { config } from '../../config';

export type RepoRef = { owner: string; name: string };
export type GithubEvent = { id?: string; type: string; payload: any; created_at?: string };

const BASE_URL = 'https://api.github.com';

/**
 * Validates that a string only contains safe characters for GitHub repository identifiers.
 * Allows alphanumeric, hyphens, underscores, and dots.
 */
function validateRepoIdentifier(value: string, fieldName: string): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
  }
  // GitHub repo names can contain alphanumeric, hyphens, underscores, and dots
  // but must not start/end with certain characters or contain path separators
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid ${fieldName}: contains invalid characters`);
  }
  if (value.startsWith('.') || value.endsWith('.') || value.startsWith('-') || value.endsWith('-')) {
    throw new Error(`Invalid ${fieldName}: cannot start or end with '.' or '-'`);
  }
  if (value.includes('..') || value.includes('//') || value.includes('\\')) {
    throw new Error(`Invalid ${fieldName}: contains path traversal characters`);
  }
}

/**
 * Validates and sanitizes a path to prevent request forgery attacks.
 * Ensures the path is a relative path that starts with '/' and doesn't contain protocol/host injection.
 */
function validatePath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid path: must be a non-empty string');
  }
  
  // Must start with '/' to be a relative path
  if (!path.startsWith('/')) {
    throw new Error('Invalid path: must be a relative path starting with "/"');
  }
  
  // Prevent protocol-relative URLs (//example.com)
  if (path.startsWith('//')) {
    throw new Error('Invalid path: protocol-relative URLs are not allowed');
  }
  
  // Prevent absolute URLs or protocol schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
    throw new Error('Invalid path: absolute URLs are not allowed');
  }
  
  return path;
}

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
    // Validate path to prevent request forgery
    const safePath = validatePath(path);
    
    // Use URL constructor to safely combine base URL with path
    // This prevents protocol/host injection attacks
    let url: URL;
    try {
      url = new URL(safePath, BASE_URL);
    } catch (error) {
      throw new Error(`Invalid URL construction: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    
    // Ensure the final URL is still pointing to the GitHub API domain
    if (!url.hostname.endsWith('github.com') && !url.hostname.endsWith('api.github.com')) {
      throw new Error('Invalid URL: hostname validation failed');
    }
    
    const response = await fetch(url.toString(), { headers: this.headers() });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API request failed (${response.status}): ${text}`);
    }
    return (await response.json()) as T;
  }

  /**
   * Validates and encodes repository owner and name for safe use in URLs.
   */
  private validateRepoRef(repo: RepoRef): { owner: string; name: string } {
    validateRepoIdentifier(repo.owner, 'owner');
    validateRepoIdentifier(repo.name, 'name');
    return {
      owner: encodeURIComponent(repo.owner),
      name: encodeURIComponent(repo.name)
    };
  }

  async fetchRepoActivity(repo: RepoRef): Promise<GithubEvent[]> {
    const safe = this.validateRepoRef(repo);
    return this.fetchJson<GithubEvent[]>(`/repos/${safe.owner}/${safe.name}/events`);
  }

  async fetchCommits(repo: RepoRef): Promise<any[]> {
    const safe = this.validateRepoRef(repo);
    return this.fetchJson<any[]>(`/repos/${safe.owner}/${safe.name}/commits`);
  }

  async fetchPRs(repo: RepoRef): Promise<any[]> {
    const safe = this.validateRepoRef(repo);
    return this.fetchJson<any[]>(`/repos/${safe.owner}/${safe.name}/pulls?state=all`);
  }

  async fetchReleases(repo: RepoRef): Promise<any[]> {
    const safe = this.validateRepoRef(repo);
    return this.fetchJson<any[]>(`/repos/${safe.owner}/${safe.name}/releases`);
  }

  async fetchContributors(repo: RepoRef): Promise<any[]> {
    const safe = this.validateRepoRef(repo);
    return this.fetchJson<any[]>(`/repos/${safe.owner}/${safe.name}/contributors`);
  }
}

export const githubClient = new GithubClient();
