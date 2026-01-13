import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { embeddingService } from '../embeddingService';
import { WillStorage } from '../will';
import type { ContinuityProfile, PersistentValue, RecurringTheme, IdentityVersion, DriftFlag } from './continuityTypes';

/**
 * Continuity Aggregator
 * Computes "soul" profile - persistent patterns across time and change
 */
export class ContinuityAggregator {
  private willStorage: WillStorage;

  constructor() {
    this.willStorage = new WillStorage();
  }

  /**
   * Compute continuity profile for user
   */
  async computeProfile(userId: string, timeWindowDays: number = 365): Promise<ContinuityProfile> {
    try {
      logger.debug({ userId, timeWindowDays }, 'Computing continuity profile');

      // 1. Get all relevant data
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

      const [
        memories,
        identityClaims,
        willEvents,
        emotionEvents,
        decisions,
      ] = await Promise.all([
        this.getMemoryEvents(userId, cutoffDate),
        this.getIdentityClaims(userId, cutoffDate),
        this.willStorage.getWillEvents(userId, { timeWindow: timeWindowDays }),
        this.getEmotionEvents(userId, cutoffDate),
        this.getDecisions(userId, cutoffDate),
      ]);

      logger.debug(
        {
          userId,
          memories: memories.length,
          identityClaims: identityClaims.length,
          willEvents: willEvents.length,
          emotionEvents: emotionEvents.length,
          decisions: decisions.length,
        },
        'Fetched data for continuity profile'
      );

      // 2. Extract persistent values
      const persistentValues = await this.extractPersistentValues({
        memories,
        identityClaims,
        willEvents,
        decisions,
      });

      // 3. Extract recurring themes
      const recurringThemes = await this.extractRecurringThemes({
        memories,
        emotionEvents,
        willEvents,
      });

      // 4. Compute identity stability
      const identityStability = this.computeIdentityStability(identityClaims);

      // 5. Compute agency metrics
      const agencyMetrics = await this.willStorage.getAgencyMetrics(userId, timeWindowDays);

      // 6. Detect drift
      const driftFlags = await this.detectDrift({
        identityClaims,
        willEvents,
        persistentValues,
        agencyMetrics,
      });

      const profile: ContinuityProfile = {
        persistent_values: persistentValues,
        recurring_themes: recurringThemes,
        identity_stability_score: identityStability.score,
        identity_versions: identityStability.versions,
        agency_density: agencyMetrics.density,
        agency_trend: agencyMetrics.trend,
        last_will_event: agencyMetrics.last_event || null,
        drift_flags: driftFlags,
        computed_at: new Date().toISOString(),
      };

      logger.info({ userId, persistentValues: persistentValues.length, themes: recurringThemes.length }, 'Computed continuity profile');
      return profile;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to compute continuity profile');
      throw error;
    }
  }

  /**
   * Get memory events
   */
  private async getMemoryEvents(userId: string, cutoffDate: Date): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, date, sentiment, metadata')
      .eq('user_id', userId)
      .gte('date', cutoffDate.toISOString())
      .order('date', { ascending: false })
      .limit(1000);

    return data || [];
  }

  /**
   * Get identity claims
   */
  private async getIdentityClaims(userId: string, cutoffDate: Date): Promise<any[]> {
    // Get from identity pulse analytics or identity core engine
    // For now, extract from journal entries and memory components
    const { data: components } = await supabaseAdmin
      .from('memory_components')
      .select('id, text, timestamp, metadata')
      .eq('user_id', userId)
      .gte('timestamp', cutoffDate.toISOString())
      .or('component_type.eq.IDENTITY,component_type.eq.CLAIM')
      .limit(500);

    return components || [];
  }

  /**
   * Get emotion events
   */
  private async getEmotionEvents(userId: string, cutoffDate: Date): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('emotion_events')
      .select('id, emotion, intensity, polarity, start_time')
      .eq('user_id', userId)
      .gte('start_time', cutoffDate.toISOString())
      .order('start_time', { ascending: false })
      .limit(500);

    return data || [];
  }

  /**
   * Get decisions
   */
  private async getDecisions(userId: string, cutoffDate: Date): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('decisions')
      .select('id, title, description, decision_type, created_at, metadata')
      .eq('user_id', userId)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    return data || [];
  }

  /**
   * Extract persistent values
   */
  private async extractPersistentValues(data: {
    memories: any[];
    identityClaims: any[];
    willEvents: any[];
    decisions: any[];
  }): Promise<PersistentValue[]> {
    // Extract value candidates from all sources
    const valueCandidates = new Map<string, {
      value: string;
      evidence: string[];
      contexts: string[];
      timestamps: string[];
    }>();

    // Extract from identity claims
    for (const claim of data.identityClaims) {
      const values = this.extractValuesFromText(claim.text || '');
      for (const value of values) {
        if (!valueCandidates.has(value)) {
          valueCandidates.set(value, {
            value,
            evidence: [],
            contexts: [],
            timestamps: [],
          });
        }
        const candidate = valueCandidates.get(value)!;
        candidate.evidence.push(claim.text);
        candidate.contexts.push('identity');
        candidate.timestamps.push(claim.timestamp || claim.created_at);
      }
    }

    // Extract from will events (values chosen under pressure)
    for (const willEvent of data.willEvents) {
      const values = this.extractValuesFromText(willEvent.meaning || willEvent.situation);
      for (const value of values) {
        if (!valueCandidates.has(value)) {
          valueCandidates.set(value, {
            value,
            evidence: [],
            contexts: [],
            timestamps: [],
          });
        }
        const candidate = valueCandidates.get(value)!;
        candidate.evidence.push(willEvent.meaning || willEvent.situation);
        candidate.contexts.push('will');
        candidate.timestamps.push(willEvent.timestamp);
      }
    }

    // Extract from decisions
    for (const decision of data.decisions) {
      const values = this.extractValuesFromText(decision.description);
      for (const value of values) {
        if (!valueCandidates.has(value)) {
          valueCandidates.set(value, {
            value,
            evidence: [],
            contexts: [],
            timestamps: [],
          });
        }
        const candidate = valueCandidates.get(value)!;
        candidate.evidence.push(decision.description);
        candidate.contexts.push('decision');
        candidate.timestamps.push(decision.created_at);
      }
    }

    // Filter to persistent values (appear across multiple contexts/time periods)
    const persistent: PersistentValue[] = [];
    for (const [value, candidate] of valueCandidates.entries()) {
      if (this.passesPersistenceTest(candidate, data)) {
        const timestamps = candidate.timestamps.sort();
        persistent.push({
          value: candidate.value,
          evidence_count: candidate.evidence.length,
          first_seen: timestamps[0],
          last_seen: timestamps[timestamps.length - 1],
          contexts: [...new Set(candidate.contexts)],
          confidence: Math.min(1, candidate.evidence.length / 3), // More evidence = higher confidence
        });
      }
    }

    return persistent.sort((a, b) => b.confidence - a.confidence).slice(0, 20); // Top 20
  }

  /**
   * Extract values from text (simple keyword-based, can be enhanced with LLM)
   */
  private extractValuesFromText(text: string): string[] {
    const valueKeywords = [
      'freedom', 'autonomy', 'independence', 'mastery', 'growth', 'learning',
      'creativity', 'authenticity', 'honesty', 'integrity', 'loyalty', 'family',
      'friendship', 'love', 'security', 'stability', 'adventure', 'exploration',
      'justice', 'fairness', 'compassion', 'kindness', 'excellence', 'quality',
      'efficiency', 'simplicity', 'beauty', 'art', 'music', 'nature', 'health',
      'wealth', 'success', 'recognition', 'privacy', 'peace', 'harmony',
    ];

    const lowerText = text.toLowerCase();
    const found: string[] = [];

    for (const keyword of valueKeywords) {
      if (lowerText.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Check if value passes persistence test
   */
  private passesPersistenceTest(
    candidate: { value: string; contexts: string[]; timestamps: string[] },
    data: any
  ): boolean {
    // Must appear in at least 2 different contexts
    const uniqueContexts = new Set(candidate.contexts);
    if (uniqueContexts.size < 2) {
      return false;
    }

    // Must span at least 30 days
    if (candidate.timestamps.length >= 2) {
      const sorted = candidate.timestamps.sort();
      const first = new Date(sorted[0]);
      const last = new Date(sorted[sorted.length - 1]);
      const daysDiff = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff < 30) {
        return false;
      }
    }

    // Must have at least 2 pieces of evidence
    if (candidate.timestamps.length < 2) {
      return false;
    }

    return true;
  }

  /**
   * Extract recurring themes
   */
  private async extractRecurringThemes(data: {
    memories: any[];
    emotionEvents: any[];
    willEvents: any[];
  }): Promise<RecurringTheme[]> {
    // Identify stress periods
    const stressPeriods = this.identifyStressPeriods(data.emotionEvents);

    // Extract themes from stress periods
    const themesInStress: string[] = [];
    for (const period of stressPeriods) {
      const periodMemories = data.memories.filter(
        m => new Date(m.date) >= period.start && new Date(m.date) <= period.end
      );
      for (const memory of periodMemories) {
        const themes = this.extractThemesFromText(memory.content);
        themesInStress.push(...themes);
      }
    }

    // Cluster similar themes
    const themeCounts = new Map<string, number>();
    for (const theme of themesInStress) {
      themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
    }

    const recurring: RecurringTheme[] = [];
    for (const [theme, frequency] of themeCounts.entries()) {
      if (frequency >= 2) {
        recurring.push({
          theme,
          frequency,
          intensity_trend: 0.5, // Can be computed from emotion intensity
          contexts: ['stress_periods'],
        });
      }
    }

    return recurring.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
  }

  /**
   * Identify stress periods from emotion events
   */
  private identifyStressPeriods(emotionEvents: any[]): Array<{ start: Date; end: Date }> {
    const periods: Array<{ start: Date; end: Date }> = [];
    const highIntensityEvents = emotionEvents.filter(
      e => e.intensity > 0.7 && (e.polarity === 'negative' || e.emotion === 'anxiety' || e.emotion === 'stress')
    );

    // Group consecutive high-intensity events
    let currentPeriod: { start: Date; end: Date } | null = null;
    for (const event of highIntensityEvents.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )) {
      const eventDate = new Date(event.start_time);
      if (!currentPeriod) {
        currentPeriod = { start: eventDate, end: eventDate };
      } else {
        const daysDiff = (eventDate.getTime() - currentPeriod.end.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 7) {
          currentPeriod.end = eventDate;
        } else {
          periods.push(currentPeriod);
          currentPeriod = { start: eventDate, end: eventDate };
        }
      }
    }
    if (currentPeriod) {
      periods.push(currentPeriod);
    }

    return periods;
  }

  /**
   * Extract themes from text (simple keyword-based)
   */
  private extractThemesFromText(text: string): string[] {
    const themeKeywords = [
      'work', 'career', 'job', 'project', 'relationship', 'family', 'friends',
      'health', 'fitness', 'creative', 'art', 'writing', 'music', 'travel',
      'learning', 'growth', 'challenge', 'struggle', 'success', 'failure',
      'change', 'transition', 'crisis', 'opportunity', 'goal', 'dream',
    ];

    const lowerText = text.toLowerCase();
    const found: string[] = [];

    for (const keyword of themeKeywords) {
      if (lowerText.includes(keyword)) {
        found.push(keyword);
      }
    }

    return found;
  }

  /**
   * Compute identity stability
   */
  private computeIdentityStability(identityClaims: any[]): {
    score: number;
    versions: IdentityVersion[];
  } {
    if (identityClaims.length === 0) {
      return { score: 0.5, versions: [] };
    }

    // Group claims by time periods (versions)
    const sorted = identityClaims.sort((a, b) =>
      new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime()
    );

    const versions: IdentityVersion[] = [];
    let currentVersion: IdentityVersion | null = null;
    let versionNum = 1;

    for (const claim of sorted) {
      const claimDate = new Date(claim.timestamp || claim.created_at);
      if (!currentVersion) {
        currentVersion = {
          version: versionNum,
          timestamp: claimDate.toISOString(),
          claims: [claim.text],
          confidence: 0.7,
        };
      } else {
        const daysDiff = (claimDate.getTime() - new Date(currentVersion.timestamp).getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 90) {
          // New version (90+ days gap)
          versions.push(currentVersion);
          versionNum++;
          currentVersion = {
            version: versionNum,
            timestamp: claimDate.toISOString(),
            claims: [claim.text],
            confidence: 0.7,
          };
        } else {
          currentVersion.claims.push(claim.text);
        }
      }
    }
    if (currentVersion) {
      versions.push(currentVersion);
    }

    // Compute stability score (fewer versions = more stable)
    const stabilityScore = Math.max(0, Math.min(1, 1 - (versions.length - 1) * 0.2));

    return {
      score: stabilityScore,
      versions,
    };
  }

  /**
   * Detect drift
   */
  private async detectDrift(data: {
    identityClaims: any[];
    willEvents: any[];
    persistentValues: PersistentValue[];
    agencyMetrics: any;
  }): Promise<DriftFlag[]> {
    const flags: DriftFlag[] = [];

    // Drift type 1: Agency declining
    if (data.agencyMetrics.trend === 'decreasing' && data.agencyMetrics.density < 0.1) {
      flags.push({
        type: 'agency',
        severity: 0.7,
        description: 'Agency frequency declining and below threshold',
        timestamp: new Date().toISOString(),
      });
    }

    // Drift type 2: Long gap without will events
    if (data.agencyMetrics.last_event) {
      const daysSince = (new Date().getTime() - new Date(data.agencyMetrics.last_event).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 30) {
        flags.push({
          type: 'agency',
          severity: 0.5,
          description: `No agency events recorded in ${Math.floor(daysSince)} days`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Drift type 3: Identity claims increasing but will events decreasing
    if (data.identityClaims.length > 10 && data.willEvents.length < 5) {
      flags.push({
        type: 'identity',
        severity: 0.6,
        description: 'Identity confidence rising but agency declining',
        timestamp: new Date().toISOString(),
      });
    }

    return flags;
  }
}
