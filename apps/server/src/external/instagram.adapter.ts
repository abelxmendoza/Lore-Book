import { ExternalEvent } from './types';

function extractTags(caption?: string): string[] {
  if (!caption) return [];
  const matches = caption.match(/#(\w+)/g) ?? [];
  return matches.map((tag) => tag.slice(1));
}

type InstagramItem = {
  timestamp: string;
  media_type: string;
  caption?: string;
  media_url?: string;
};

type InstagramResponse = { items: InstagramItem[] };

export function instagramAdapter(apiResponse: InstagramResponse): ExternalEvent[] {
  return (apiResponse.items ?? []).map((item) => ({
    source: 'instagram' as const,
    timestamp: item.timestamp,
    type: item.media_type,
    text: item.caption,
    imageUrl: item.media_url,
    tags: extractTags(item.caption),
  }));
}
