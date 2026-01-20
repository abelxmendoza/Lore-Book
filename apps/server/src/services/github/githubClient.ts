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
    // Use explicit whitelist to prevent subdomain bypass attacks (e.g., evil-github.com, github.com.evil.com)
    const allowedHosts = [
      'github.com',
      'api.github.com',
      'gist.github.com',
      'raw.githubusercontent.com'
    ];
    
    const hostname = url.hostname;
    let isAllowed = false;
    
    // Check for exact match first
    if (allowedHosts.includes(hostname)) {
      isAllowed = true;
    }
    // For subdomains, ensure it's a legitimate GitHub subdomain
    // Only allow *.github.com or *.githubusercontent.com with proper validation
    else if (hostname.endsWith('.github.com')) {
      const parts = hostname.split('.');
      // Must be exactly 3 parts: subdomain.github.com
      if (parts.length === 3 && parts[0].length > 0) {
        // Additional validation: subdomain must be alphanumeric with hyphens/underscores
        if (/^[a-zA-Z0-9_-]+$/.test(parts[0])) {
          isAllowed = true;
        }
      }
    }
    else if (hostname.endsWith('.githubusercontent.com')) {
      const parts = hostname.split('.');
      // Must be exactly 3 parts: subdomain.githubusercontent.com
      if (parts.length === 3 && parts[0].length > 0) {
        // Additional validation: subdomain must be alphanumeric with hyphens/underscores
        if (/^[a-zA-Z0-9_-]+$/.test(parts[0])) {
          isAllowed = true;
        }
      }
    }
    
    // If hostname is not allowed, throw error
    if (!isAllowed) {
      throw new Error(`Invalid URL: hostname "${hostname}" is not in the allowed list`);
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
