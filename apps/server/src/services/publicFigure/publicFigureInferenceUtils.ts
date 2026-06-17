import type { InferredInteraction } from './publicFigureTypes';

type Episode = { source: 'chat' | 'journal'; id: string; text: string };

const INTERACTION_CUES =
  /\b(talked|spoke|chatted|met|introduced|hugged|danced with|hung out|backstage|after the show|dm(?:ed)?|messaged|said hi|shook hands|connected with|told me|asked me|we laughed|took a photo|selfie with)\b/i;

const PRESENCE_CUES =
  /\b(saw|watched|performed|their set|their show|on stage|in the crowd|front row|at the club|afterparty|lineup|opened for|headlined)\b/i;

const USER_REF = /\b(I|me|my|we|us|I'm|I've)\b/i;

const SCENE_VENUES =
  /\b(club metro|goth|show|anniversary|underground|venue|afterparty|dance floor|backstage)\b/i;

function splitWindows(text: string, figureName: string): string[] {
  const windows: string[] = [];
  const lower = text.toLowerCase();
  const key = figureName.toLowerCase();
  let idx = 0;
  while (idx < lower.length) {
    const at = lower.indexOf(key, idx);
    if (at === -1) break;
    const start = Math.max(0, at - 180);
    const end = Math.min(text.length, at + figureName.length + 180);
    windows.push(text.slice(start, end));
    idx = at + figureName.length;
  }
  return windows;
}

export function inferFromEpisodes(name: string, episodes: Episode[]): InferredInteraction[] {
  const hits: InferredInteraction[] = [];
  for (const ep of episodes) {
    for (const window of splitWindows(ep.text, name)) {
      if (USER_REF.test(window) && INTERACTION_CUES.test(window)) {
        hits.push({
          type: 'explicit_dialogue',
          confidence: 0.88,
          evidence: window.trim().slice(0, 140),
          source: ep.source,
        });
      } else if (PRESENCE_CUES.test(window) && (USER_REF.test(window) || SCENE_VENUES.test(window))) {
        hits.push({
          type: 'scene_context',
          confidence: 0.72,
          evidence: window.trim().slice(0, 140),
          source: ep.source,
        });
      } else if (USER_REF.test(window) && SCENE_VENUES.test(window)) {
        hits.push({
          type: 'co_location',
          confidence: 0.65,
          evidence: window.trim().slice(0, 140),
          source: ep.source,
        });
      }
    }
  }
  return hits.slice(0, 8);
}
