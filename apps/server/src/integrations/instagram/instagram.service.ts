import { logger } from '../../logger';
import { appendToInbox, distillInbox, runIntegrationPipeline } from '../integration.utils';
import type { InstagramMedia, InstagramSyncResult } from './instagram.types';

const fetchInstagramMedia = async (_userId: string): Promise<InstagramMedia[]> => {
  return [
    {
      id: `ig-${Date.now()}`,
      caption: 'Sunset capture for integration bootstrap',
      media_type: 'IMAGE',
      media_url: 'https://example.com/photo.jpg',
      timestamp: new Date().toISOString()
    }
  ];
};

export class InstagramIntegrationService {
  async sync(userId: string): Promise<InstagramSyncResult> {
    const items = await fetchInstagramMedia(userId);
    return appendToInbox('instagram', items);
  }

  async handleWebhook(userId: string, payload: InstagramMedia | InstagramMedia[]): Promise<InstagramSyncResult> {
    const events = Array.isArray(payload) ? payload : [payload];
    const normalized = events.map((evt) => ({ ...evt, userId }));
    return appendToInbox('instagram', normalized);
  }

  async getDistilled(userId: string) {
    return distillInbox('instagram', userId);
  }

  async refresh(userId: string) {
    const result = await runIntegrationPipeline(userId);
    logger.info({ result, userId }, 'Integration pipeline refreshed for Instagram');
    return result;
  }
}

export const instagramIntegrationService = new InstagramIntegrationService();
