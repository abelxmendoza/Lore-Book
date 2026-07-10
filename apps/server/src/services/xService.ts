import { config } from '../config';
import { xApiGuard } from '../lib/externalCircuitBreaker';
import { logger } from '../logger';
import { openai } from '../lib/openai';
import type { MemoryEntry } from '../types';

import { memoryService } from './memoryService';
import { supabaseAdmin } from './supabaseClient';

type XPost = {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
  };
  entities?: {
    hashtags?: Array<{ tag: string }>;
    urls?: Array<{ expanded_url?: string }>;
  };
  attachments?: {
    media_keys?: string[];
  };
};

export type XMediaItem = {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
};

type XTimelinePayload = {
  data?: XPost[];
  includes?: { media?: XMediaItem[] };
};

/**
 * Join each post to its attached media via `includes.media`. Photos fall back
 * to `preview_image_url` for video/gif so every attachment yields a usable
 * image URL for the lore galleries.
 */
export function resolvePostMedia(payload: XTimelinePayload): Map<string, XMediaItem[]> {
  const byKey = new Map<string, XMediaItem>(
    (payload.includes?.media ?? []).map((m) => [m.media_key, m] as const),
  );
  const out = new Map<string, XMediaItem[]>();
  for (const post of payload.data ?? []) {
    const items = (post.attachments?.media_keys ?? [])
      .map((k) => byKey.get(k))
      .filter((m): m is XMediaItem => Boolean(m))
      .map((m) => ({ ...m, url: m.url ?? m.preview_image_url }))
      .filter((m) => Boolean(m.url));
    if (items.length > 0) out.set(post.id, items);
  }
  return out;
}

type SyncOptions = {
  handle: string;
  maxPosts?: number;
  sinceId?: string;
  includeReplies?: boolean;
};

class XService {
  private readonly baseUrl = 'https://api.twitter.com/2';

  private getAuthHeaders() {
    if (!config.xBearerToken) {
      throw new Error('X API bearer token is not configured. Set X_API_BEARER_TOKEN to enable X sync.');
    }

    return {
      Authorization: `Bearer ${config.xBearerToken}`
    } as Record<string, string>;
  }

  private async fetchUserId(handle: string): Promise<string> {
    const response = await xApiGuard.run(() =>
      fetch(`${this.baseUrl}/users/by/username/${handle}`, {
        headers: this.getAuthHeaders(),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch X user: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as { data?: { id: string } };
    const userId = payload.data?.id;

    if (!userId) {
      throw new Error(`X user not found for @${handle}`);
    }

    return userId;
  }

  private async fetchRecentPosts(
    xUserId: string,
    options: SyncOptions
  ): Promise<{ posts: XPost[]; mediaByPost: Map<string, XMediaItem[]> }> {
    const params = new URLSearchParams({
      max_results: `${Math.min(options.maxPosts ?? 20, 100)}`,
      'tweet.fields': 'created_at,public_metrics,entities,attachments',
      expansions: 'attachments.media_keys',
      'media.fields': 'media_key,type,url,preview_image_url,alt_text'
    });

    params.append('exclude', options.includeReplies ? 'retweets' : 'retweets,replies');

    if (options.sinceId) {
      params.append('since_id', options.sinceId);
    }

    const response = await xApiGuard.run(() =>
      fetch(`${this.baseUrl}/users/${xUserId}/tweets?${params.toString()}`, {
        headers: this.getAuthHeaders(),
      })
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch X posts: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as XTimelinePayload;
    return { posts: payload.data ?? [], mediaByPost: resolvePostMedia(payload) };
  }

  private async entryExists(userId: string, postId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>x_post_id', postId)
      .limit(1);

    if (error) {
      logger.warn({ error, postId }, 'Failed to check for existing X post entry');
      return false;
    }

    return Boolean(data && data.length > 0);
  }

  private extractTags(text: string, providedTags?: Array<{ tag: string }>) {
    const tags = providedTags?.map((tag) => tag.tag.toLowerCase()) ?? [];
    const inlineMatches = text.match(/#(\w+)/g) ?? [];
    inlineMatches.forEach((match) => tags.push(match.replace('#', '').toLowerCase()));
    return Array.from(new Set(tags));
  }

  private async craftContent(handle: string, post: XPost, media: XMediaItem[]): Promise<string> {
    const fallback = `Posted on X (@${handle}): ${post.text}`;
    const mediaNote =
      media.length > 0
        ? `\nAttached media: ${media
            .map((m, i) => `${m.type}${m.alt_text ? ` (${m.alt_text})` : ` ${i + 1}`}`)
            .join(', ')}`
        : '';

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content:
              'You are Lore Book, turning X posts into personal timeline updates. Write in first person, keep it concise, and include any emotional tone or intent implied by the post.'
          },
          {
            role: 'user',
            content: `Handle: @${handle}\nPosted at: ${post.created_at}\nText: ${post.text}${mediaNote}\nLikes: ${post.public_metrics?.like_count ?? 0}\nReplies: ${
              post.public_metrics?.reply_count ?? 0
            }\nRetweets: ${post.public_metrics?.retweet_count ?? 0}\nQuotes: ${post.public_metrics?.quote_count ?? 0}\n\nTransform this into a reflective journal note and keep it under 120 words. If media is attached, mention what the photo shows when the alt text reveals it.`
          }
        ]
      });

      const generated = completion.choices[0]?.message?.content?.trim();
      return generated && generated.length > 0 ? generated : fallback;
    } catch (error) {
      logger.warn({ error, postId: post.id }, 'Falling back to raw X post content');
      return fallback;
    }
  }

  async syncPosts(userId: string, options: SyncOptions): Promise<{
    entriesCreated: number;
    postsProcessed: number;
    skipped: number;
    entries: MemoryEntry[];
  }> {
    const xUserId = await this.fetchUserId(options.handle);
    const { posts, mediaByPost } = await this.fetchRecentPosts(xUserId, options);

    const entries: MemoryEntry[] = [];
    let skipped = 0;

    for (const post of posts) {
      if (await this.entryExists(userId, post.id)) {
        skipped += 1;
        continue;
      }

      const media = mediaByPost.get(post.id) ?? [];
      const content = await this.craftContent(options.handle, post, media);
      const tags = [
        'x',
        'social',
        'post',
        `handle:${options.handle.toLowerCase()}`,
        ...(media.length > 0 ? ['photo'] : []),
        ...this.extractTags(post.text, post.entities?.hashtags)
      ];

      const entry = await memoryService.saveEntry({
        userId,
        content,
        date: post.created_at,
        tags,
        source: 'x',
        metadata: {
          x_post_id: post.id,
          x_handle: options.handle,
          x_url: `https://x.com/${options.handle}/status/${post.id}`,
          public_metrics: post.public_metrics,
          raw_post: post,
          ...(media.length > 0 ? { x_media: media } : {})
        }
      });

      entries.push(entry);
    }

    logger.info(
      {
        handle: options.handle,
        postsProcessed: posts.length,
        created: entries.length,
        skipped
      },
      'X posts synced into journal'
    );

    return {
      entriesCreated: entries.length,
      postsProcessed: posts.length,
      skipped,
      entries
    };
  }
}

export const xService = new XService();
