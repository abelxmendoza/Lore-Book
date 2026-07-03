import { config } from '../config';
import { xApiGuard } from '../lib/externalCircuitBreaker';

import type { XResponse } from './x.adapter';

type FetchXPostsOptions = {
  handle?: string;
  userId?: string;
  maxPosts?: number;
  sinceId?: string;
  includeReplies?: boolean;
};

type XUserLookupResponse = {
  data?: {
    id?: string;
    username?: string;
  };
};

const X_API_BASE_URL = 'https://api.twitter.com/2';

function authHeaders(): Record<string, string> {
  if (!config.xBearerToken) {
    throw new Error('X API bearer token is not configured. Set X_API_BEARER_TOKEN in .env.');
  }

  return { Authorization: `Bearer ${config.xBearerToken}` };
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '');
}

async function readJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${context}: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<T>;
}

async function resolveUser(options: FetchXPostsOptions): Promise<{ id: string; username?: string }> {
  if (options.userId) {
    return { id: options.userId, username: options.handle ? normalizeHandle(options.handle) : undefined };
  }

  const handle = normalizeHandle(options.handle ?? config.xDefaultHandle ?? '');
  if (!handle) {
    if (config.xDefaultUserId) return { id: config.xDefaultUserId };
    throw new Error('X handle is required. Pass { "handle": "your_handle" } or set X_API_HANDLE in .env.');
  }

  const params = new URLSearchParams({ 'user.fields': 'username' });
  const response = await xApiGuard.run(() =>
    fetch(`${X_API_BASE_URL}/users/by/username/${encodeURIComponent(handle)}?${params.toString()}`, {
      headers: authHeaders(),
    })
  );
  const payload = await readJson<XUserLookupResponse>(response, `Failed to fetch X user @${handle}`);
  const id = payload.data?.id;
  if (!id) throw new Error(`X user not found for @${handle}`);

  return { id, username: payload.data?.username ?? handle };
}

export async function fetchOriginalXPosts(options: FetchXPostsOptions = {}): Promise<XResponse> {
  const user = await resolveUser(options);
  const params = new URLSearchParams({
    max_results: `${Math.min(Math.max(options.maxPosts ?? 25, 5), 100)}`,
    expansions: 'author_id,attachments.media_keys,referenced_tweets.id',
    'tweet.fields': 'created_at,public_metrics,entities,attachments,referenced_tweets,lang,note_tweet',
    'user.fields': 'username',
    'media.fields': 'url,preview_image_url,type',
  });

  params.set('exclude', options.includeReplies ? 'retweets' : 'retweets,replies');
  if (options.sinceId) params.set('since_id', options.sinceId);

  const response = await xApiGuard.run(() =>
    fetch(`${X_API_BASE_URL}/users/${encodeURIComponent(user.id)}/tweets?${params.toString()}`, {
      headers: authHeaders(),
    })
  );
  const payload = await readJson<XResponse>(response, `Failed to fetch X posts for ${user.username ?? user.id}`);

  if (Array.isArray(payload)) return payload;

  const includes = payload.includes ?? {};
  const users = [...(includes.users ?? [])];
  if (user.username && !users.some((included) => included.id === user.id)) {
    users.push({ id: user.id, username: user.username });
  }

  return {
    ...payload,
    includes: {
      ...includes,
      users,
    },
  };
}
