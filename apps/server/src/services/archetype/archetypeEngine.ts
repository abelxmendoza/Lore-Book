import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { DistortionDetector } from './distortionDetector';
import { ProfileCalculator } from './profileCalculator';
import { ArchetypeSignalExtractor } from './signalExtractor';
import { TransitionDetector } from './transitionDetector';
import type { ArchetypeOutput } from './types';

/**
 * Archetype Engine V1
 * Extracts archetype signals, computes profile, detects transitions and distortions
 */
export class ArchetypeEngine {
  private extractor: ArchetypeSignalExtractor;
  private profileCalculator: ProfileCalculator;
  private transitionDetector: TransitionDetector;
  private distortionDetector: DistortionDetector;

  constructor() {
    this.extractor = new ArchetypeSignalExtractor();
    this.profileCalculator = new ProfileCalculator();
    this.transitionDetector = new TransitionDetector();
    this.distortionDetector = new DistortionDetector();
  }

  /**
   * Process archetypes for a user
   */
  async process(userId: string): Promise<ArchetypeOutput> {
    try {
      logger.debug({ userId }, 'Processing archetypes');

      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000);

      // Step 1: Extract raw archetype signals
      const signals = this.extractor.extract(entries || []);
      signals.forEach(s => { s.user_id = userId; });

      // Step 2: Compute archetype profile
      const profile = this.profileCalculator.calculate(signals);
      profile.user_id = userId;

      // Step 3: Detect transitions
      const transitions = this.transitionDetector.detect(signals);
      transitions.forEach(t => { t.user_id = userId; });

      // Step 4: Detect distortions
      const distortions = this.distortionDetector.detect(profile);
      distortions.forEach(d => { d.user_id = userId; });

      logger.info(
        {
          userId,
          signals: signals.length,
          dominant: profile.dominant,
          transitions: transitions.length,
          distortions: distortions.length,
        },
        'Processed archetypes'
      );

      return {
        signals,
        profile,
        transitions,
        distortions,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process archetypes');
      return {
        signals: [],
        profile: {
          user_id: userId,
          dominant: 'Unknown',
          secondary: [],
          distribution: {},
        },
        transitions: [],
        distortions: [],
      };
    }
  }
}

