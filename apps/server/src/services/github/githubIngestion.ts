import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ClassifiedEvent } from './githubClassifier';

export type IngestableEvent = {
  type: string;
  payload: any;
  created_at?: string;
};

const noiseKeywords = ['fix', 'typo', 'lint', 'format', 'bump', 'deps', 'readme', 'merge'];
const tinyVersionPattern = /0\.0\.\d+/;

const isNoise = (message: string): boolean => {
  const normalized = message.toLowerCase();
  if (normalized.length < 12) return true;
  if (noiseKeywords.some((keyword) => normalized.includes(keyword))) return true;
  if (tinyVersionPattern.test(normalized)) return true;
  return false;
};

export const filterNoise = (events: IngestableEvent[]): IngestableEvent[] => {
  return events.filter((event) => {
    const message = event.payload?.message ?? event.payload?.title ?? '';
    const files: string[] = event.payload?.files ?? [];
    const isReadmeOnly = files.length && files.every((file) => file.toLowerCase().includes('readme'));
    return !isNoise(message) && !isReadmeOnly;
  });
};

export const persistEvents = async (repoId: number, events: ClassifiedEvent[]): Promise<void> => {
  if (!events.length) return;
  const { error } = await supabaseAdmin.from('github_events').insert(
    events.map((event) => ({
      repo_id: repoId,
      event_type: event.classification,
      payload: event,
      committed_at: event.created_at ?? null
    }))
  );

  if (error) {
    logger.warn({ error }, 'Failed to persist GitHub events');
  }
};
