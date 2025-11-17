import { logger } from '../../logger';
import { appendToInbox, distillInbox, runIntegrationPipeline } from '../integration.utils';
import type { GithubEvent, GithubSyncResult } from './github.types';

const fetchGithubActivity = async (_userId: string): Promise<GithubEvent[]> => {
  return [
    {
      id: `gh-${Date.now()}`,
      type: 'push',
      title: 'Repository activity',
      repo: 'lore-keeper/demo',
      created_at: new Date().toISOString(),
      summary: 'Sample commit set for integration bootstrap'
    }
  ];
};

export class GithubIntegrationService {
  async sync(userId: string): Promise<GithubSyncResult> {
    const events = await fetchGithubActivity(userId);
    return appendToInbox('github', events);
  }

  async handleWebhook(userId: string, payload: GithubEvent | GithubEvent[]): Promise<GithubSyncResult> {
    const events = Array.isArray(payload) ? payload : [payload];
    const normalized = events.map((evt) => ({ ...evt, userId }));
    return appendToInbox('github', normalized);
  }

  async getDistilled(userId: string) {
    return distillInbox('github', userId);
  }

  async refresh(userId: string) {
    const result = await runIntegrationPipeline(userId);
    logger.info({ result, userId }, 'Integration pipeline refreshed for GitHub');
    return result;
  }
}

export const githubIntegrationService = new GithubIntegrationService();
