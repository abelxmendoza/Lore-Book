import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
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
};

type SyncOptions = {
  handle: string;
  maxPosts?: number;
  sinceId?: string;
  includeReplies?: boolean;
};

class XService {
  private readonly baseUrl = 'https://api.twitter.com/2';
  private readonly openai = new OpenAI({ apiKey: config.openAiKey });

  private getAuthHeaders() {
    if (!config.xBearerToken) {
      throw new Error('X API bearer token is not configured. Set X_API_BEARER_TOKEN to enable X sync.');
    }

    return {
      Authorization: `Bearer ${config.xBearerToken}`
    } as Record<string, string>;
  }

  private async fetchUserId(handle: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/users/by/username/${handle}`, {
      headers: this.getAuthHeaders()
    });

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

  private async fetchRecentPosts(xUserId: string, options: SyncOptions): Promise<XPost[]> {
    const params = new URLSearchParams({
      max_results: `${Math.min(options.maxPosts ?? 20, 100)}`,
      'tweet.fields': 'created_at,public_metrics,entities'
    });

    params.append('exclude', options.includeReplies ? 'retweets' : 'retweets,replies');

    if (options.sinceId) {
      params.append('since_id', options.sinceId);
    }

    const response = await fetch(`${this.baseUrl}/users/${xUserId}/tweets?${params.toString()}`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch X posts: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as { data?: XPost[] };
    return payload.data ?? [];
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

  private async craftContent(handle: string, post: XPost): Promise<string> {
    const fallback = `Posted on X (@${handle}): ${post.text}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content:
              'You are Lore Keeper, turning X posts into personal timeline updates. Write in first person, keep it concise, and include any emotional tone or intent implied by the post.'
          },
          {
            role: 'user',
            content: `Handle: @${handle}\nPosted at: ${post.created_at}\nText: ${post.text}\nLikes: ${post.public_metrics?.like_count ?? 0}\nReplies: ${
              post.public_metrics?.reply_count ?? 0
            }\nRetweets: ${post.public_metrics?.retweet_count ?? 0}\nQuotes: ${post.public_metrics?.quote_count ?? 0}\n\nTransform this into a reflective journal note and keep it under 120 words.`
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
    const posts = await this.fetchRecentPosts(xUserId, options);

    const entries: MemoryEntry[] = [];
    let skipped = 0;

    for (const post of posts) {
      if (await this.entryExists(userId, post.id)) {
        skipped += 1;
        continue;
      }

      const content = await this.craftContent(options.handle, post);
      const tags = [
        'x',
        'social',
        'post',
        `handle:${options.handle.toLowerCase()}`,
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
          raw_post: post
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
