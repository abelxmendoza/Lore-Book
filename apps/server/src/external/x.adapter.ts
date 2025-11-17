import { ExternalEvent } from './types';

type XPost = { id: string; created_at: string; text: string; media_urls?: string[] };

type XResponse = { posts: XPost[] };

export function xAdapter(response: XResponse): ExternalEvent[] {
  return (response.posts ?? []).map((post) => ({
    source: 'x' as const,
    timestamp: post.created_at,
    type: 'post',
    text: post.text,
    imageUrl: post.media_urls?.[0],
    tags: post.media_urls?.length ? ['media'] : [],
  }));
}
