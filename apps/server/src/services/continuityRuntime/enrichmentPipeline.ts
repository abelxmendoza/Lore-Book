import { logger } from '../../logger';
import { runForAllActiveUsers } from '../../workers/workerUtils';

export interface EntryAnalyzerInput {
  id: string;
  content: string;
  date: string;
}

export interface EntryAnalyzer {
  name: string;
  tier: 'ENRICHMENT' | 'EXPERIMENTAL';
  processEntry(userId: string, entry: EntryAnalyzerInput): Promise<void>;
}

export interface UserAnalyzer {
  name: string;
  tier: 'ENRICHMENT' | 'EXPERIMENTAL';
  processUser(userId: string): Promise<void>;
}

/**
 * Single runner for all enrichment analyzers.
 * Provides error isolation, timing traces, and bounded concurrency.
 * Register analyzers at startup; call runForEntry / runForAllUsers from jobs.
 */
export class ContinuityEnrichmentPipeline {
  private entryAnalyzers: EntryAnalyzer[] = [];
  private userAnalyzers: UserAnalyzer[] = [];

  registerEntryAnalyzer(analyzer: EntryAnalyzer): this {
    this.entryAnalyzers.push(analyzer);
    return this;
  }

  registerUserAnalyzer(analyzer: UserAnalyzer): this {
    this.userAnalyzers.push(analyzer);
    return this;
  }

  async runForEntry(userId: string, entry: EntryAnalyzerInput): Promise<void> {
    if (this.entryAnalyzers.length === 0) return;
    if (!entry.content || entry.content.length < 50) return;

    const results = await Promise.allSettled(
      this.entryAnalyzers.map(async (analyzer) => {
        const start = Date.now();
        try {
          await analyzer.processEntry(userId, entry);
          logger.debug(
            { analyzer: analyzer.name, tier: analyzer.tier, userId, entryId: entry.id, durationMs: Date.now() - start },
            'enrichment.entry.complete'
          );
        } catch (err) {
          logger.warn(
            { analyzer: analyzer.name, tier: analyzer.tier, userId, entryId: entry.id, durationMs: Date.now() - start, err },
            'enrichment.entry.failed'
          );
          throw err;
        }
      })
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      logger.warn({ userId, entryId: entry.id, failed, total: this.entryAnalyzers.length }, 'enrichment.entry: analyzers failed');
    }
  }

  async runForUser(userId: string): Promise<void> {
    if (this.userAnalyzers.length === 0) return;

    const results = await Promise.allSettled(
      this.userAnalyzers.map(async (analyzer) => {
        const start = Date.now();
        try {
          await analyzer.processUser(userId);
          logger.debug(
            { analyzer: analyzer.name, tier: analyzer.tier, userId, durationMs: Date.now() - start },
            'enrichment.user.complete'
          );
        } catch (err) {
          logger.warn(
            { analyzer: analyzer.name, tier: analyzer.tier, userId, durationMs: Date.now() - start, err },
            'enrichment.user.failed'
          );
          throw err;
        }
      })
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      logger.warn({ userId, failed, total: this.userAnalyzers.length }, 'enrichment.user: analyzers failed');
    }
  }

  async runForAllUsers(concurrency = 5): Promise<void> {
    await runForAllActiveUsers('continuity-enrichment', this.runForUser.bind(this), concurrency);
  }

  get registeredAnalyzers(): { entry: string[]; user: string[] } {
    return {
      entry: this.entryAnalyzers.map(a => `${a.tier}:${a.name}`),
      user: this.userAnalyzers.map(a => `${a.tier}:${a.name}`),
    };
  }
}
