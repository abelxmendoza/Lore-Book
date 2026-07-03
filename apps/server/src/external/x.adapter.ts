import { ExternalEvent } from './types';

type XPostEntityUrl = {
  start?: number;
  end?: number;
  url?: string;
  expanded_url?: string;
  display_url?: string;
};

type XPostEntityHashtag = {
  tag?: string;
};

type XPostReference = {
  type?: 'retweeted' | 'quoted' | 'replied_to' | string;
  id?: string;
};

type XPostAttachments = {
  media_keys?: string[];
};

type XPostEntities = {
  urls?: XPostEntityUrl[];
  hashtags?: XPostEntityHashtag[];
};

type XPost = {
  id: string;
  created_at?: string;
  text?: string;
  full_text?: string;
  note_tweet?: {
    text?: string;
  };
  author_id?: string;
  username?: string;
  media_urls?: string[];
  entities?: XPostEntities;
  referenced_tweets?: XPostReference[];
  attachments?: XPostAttachments;
  lang?: string;
  public_metrics?: Record<string, number>;
};

type XMedia = {
  media_key?: string;
  url?: string;
  preview_image_url?: string;
  type?: string;
};

type XUser = {
  id?: string;
  username?: string;
};

type XIncludes = {
  media?: XMedia[];
  users?: XUser[];
};

export type XResponse =
  | { posts?: XPost[]; includes?: XIncludes }
  | { data?: XPost[] | XPost; includes?: XIncludes }
  | XPost[];

function asPosts(response: XResponse): XPost[] {
  if (Array.isArray(response)) return response;
  if ('posts' in response && Array.isArray(response.posts)) return response.posts;
  if ('data' in response) {
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (data) return [data];
  }
  return [];
}

function normalizeText(post: XPost): string {
  const raw = post.note_tweet?.text ?? post.full_text ?? post.text ?? '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function urlForPost(post: XPost, includes?: XIncludes): string | undefined {
  const includedAuthor = includes?.users?.find((user) => user.id === post.author_id);
  const username = post.username ?? includedAuthor?.username;
  return username ? `https://x.com/${username}/status/${post.id}` : undefined;
}

function imageUrlForPost(post: XPost, includes?: XIncludes): string | undefined {
  if (post.media_urls?.[0]) return post.media_urls[0];

  const mediaByKey = new Map((includes?.media ?? []).map((media) => [media.media_key, media]));
  const firstMedia = post.attachments?.media_keys?.map((key) => mediaByKey.get(key)).find(Boolean);
  return firstMedia?.url ?? firstMedia?.preview_image_url;
}

function hashtagsForPost(post: XPost): string[] {
  return (post.entities?.hashtags ?? [])
    .map((hashtag) => hashtag.tag?.trim())
    .filter((tag): tag is string => Boolean(tag));
}

function expandedUrlsForPost(post: XPost): string[] {
  return (post.entities?.urls ?? [])
    .map((url) => url.expanded_url ?? url.url)
    .filter((url): url is string => Boolean(url));
}

function isOriginalPost(post: XPost): boolean {
  return !(post.referenced_tweets ?? []).some((ref) => ref.type === 'retweeted' || ref.type === 'replied_to');
}

export function xAdapter(response: XResponse): ExternalEvent[] {
  const includes = Array.isArray(response) ? undefined : response.includes;

  return asPosts(response)
    .filter((post) => post.id && isOriginalPost(post))
    .map((post) => {
      const imageUrl = imageUrlForPost(post, includes);
      const tags = [...hashtagsForPost(post), ...(imageUrl ? ['media'] : [])];

      return {
        source: 'x' as const,
        sourceId: post.id,
        timestamp: post.created_at ?? new Date(0).toISOString(),
        type: 'post',
        text: normalizeText(post),
        imageUrl,
        url: urlForPost(post, includes),
        tags,
        metadata: {
          author_id: post.author_id,
          lang: post.lang,
          public_metrics: post.public_metrics,
          quoted_post_id: post.referenced_tweets?.find((ref) => ref.type === 'quoted')?.id,
          expanded_urls: expandedUrlsForPost(post),
        },
      };
    });
}
