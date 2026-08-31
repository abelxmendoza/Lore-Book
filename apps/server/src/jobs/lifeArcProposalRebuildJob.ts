import cron from 'node-cron';

import { logger } from '../logger';
import { lifeArcProposalService } from '../services/continuityRuntime/arcs/lifeArcProposalService';
import { supabaseAdmin } from '../services/supabaseClient';

const BATCH_SIZE = 20;

class LifeArcProposalRebuildJob {
  async runBatch(): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('life_arc_proposal_rebuild_requests')
      .select('user_id, attempts')
      .order('requested_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return;
      logger.warn({ code: error.code }, 'Life arc proposal rebuild queue could not be read');
      return;
    }

    let completed = 0;
    let failed = 0;
    for (const request of data ?? []) {
      try {
        await lifeArcProposalService.build(request.user_id, true);
        await supabaseAdmin
          .from('life_arc_proposal_rebuild_requests')
          .delete()
          .eq('user_id', request.user_id);
        completed += 1;
      } catch (buildError) {
        const message = buildError instanceof Error ? buildError.message.slice(0, 500) : 'Unknown rebuild error';
        await supabaseAdmin
          .from('life_arc_proposal_rebuild_requests')
          .update({ attempts: Number(request.attempts ?? 0) + 1, last_error: message })
          .eq('user_id', request.user_id);
        failed += 1;
      }
    }

    if (completed > 0 || failed > 0) {
      logger.info({ completed, failed }, 'Life arc proposal rebuild batch finished');
    }
  }

  register(): void {
    cron.schedule('*/15 * * * *', () => void this.runBatch());
    logger.info('Life arc proposal rebuild job registered (every 15 minutes)');
  }
}

export const lifeArcProposalRebuildJob = new LifeArcProposalRebuildJob();
