import { distillInbox } from './integration.utils';

export class IntegrationAggregationService {
  async getDistilled(userId: string) {
    const [github, instagram] = await Promise.all([
      distillInbox('github', userId),
      distillInbox('instagram', userId)
    ]);

    return {
      github,
      instagram
    };
  }
}

export const integrationAggregationService = new IntegrationAggregationService();
