import { logger } from '../../logger';
import type { LegacyCluster, LegacyDomainResult } from './types';

/**
 * Generates multi-decade legacy storylines
 */
export class LegacyNarrative {
  /**
   * Build narrative from clusters
   */
  build(clusters: LegacyCluster[]): string {
    try {
      if (clusters.length === 0) {
        return 'Your legacy is still being written. Continue building meaningful experiences.';
      }

      // Sort by significance
      const sorted = [...clusters].sort((a, b) => b.significance - a.significance);

      const narratives: string[] = [];

      for (const cluster of sorted) {
        const narrative = this.buildClusterNarrative(cluster);
        narratives.push(narrative);
      }

      return narratives.join('\n\n');
    } catch (error) {
      logger.error({ error }, 'Failed to build legacy narrative');
      return 'Unable to generate legacy narrative at this time.';
    }
  }

  /**
   * Build narrative for a single cluster
   */
  private buildClusterNarrative(cluster: LegacyCluster): string {
    const signalCount = cluster.signals.length;
    const domain = cluster.domain || 'life';
    const significance = cluster.significance;

    if (significance >= 0.7) {
      return `Your legacy in ${domain} is strengthening. This theme appears in ${signalCount} key events, showing a clear and growing impact.`;
    } else if (significance >= 0.4) {
      return `Your legacy in ${domain} is developing. This theme appears in ${signalCount} events, indicating a meaningful direction.`;
    } else if (significance >= 0) {
      return `Your legacy in ${domain} is emerging. This theme appears in ${signalCount} events, showing early foundations.`;
    } else {
      return `Your legacy in ${domain} shows some challenges. This theme appears in ${signalCount} events, indicating areas that may need attention.`;
    }
  }

  /**
   * Build narrative from domain results
   */
  buildFromResults(results: LegacyDomainResult[]): string {
    try {
      if (results.length === 0) {
        return 'Your legacy is still being written. Continue building meaningful experiences.';
      }

      // Sort by score
      const sorted = [...results].sort((a, b) => b.score - a.score);

      const narratives: string[] = [];

      for (const result of sorted) {
        const narrative = this.buildDomainNarrative(result);
        narratives.push(narrative);
      }

      return narratives.join('\n\n');
    } catch (error) {
      logger.error({ error }, 'Failed to build legacy narrative from results');
      return 'Unable to generate legacy narrative at this time.';
    }
  }

  /**
   * Build narrative for a domain result
   */
  private buildDomainNarrative(result: LegacyDomainResult): string {
    const { domain, score, signal_count, positive_signals, negative_signals } = result;

    if (score >= 0.6) {
      return `Your legacy in ${domain} is very strong. You have ${positive_signals} positive signals showing clear impact and growth.`;
    } else if (score >= 0.3) {
      return `Your legacy in ${domain} is strengthening. You have ${signal_count} signals showing meaningful development.`;
    } else if (score >= -0.3) {
      return `Your legacy in ${domain} is developing. You have ${signal_count} signals showing early foundations.`;
    } else if (score >= -0.6) {
      return `Your legacy in ${domain} is fragile. You have ${negative_signals} negative signals indicating challenges.`;
    } else {
      return `Your legacy in ${domain} is at risk. You have ${negative_signals} negative signals showing significant concerns.`;
    }
  }

  /**
   * Generate summary narrative
   */
  generateSummary(results: LegacyDomainResult[], clusters: LegacyCluster[]): string {
    try {
      const strongDomains = results.filter(r => r.score >= 0.6).map(r => r.domain);
      const fragileDomains = results.filter(r => r.score <= -0.3).map(r => r.domain);

      let summary = '';

      if (strongDomains.length > 0) {
        summary += `Your strongest legacy domains are: ${strongDomains.join(', ')}. `;
      }

      if (fragileDomains.length > 0) {
        summary += `Areas needing attention: ${fragileDomains.join(', ')}. `;
      }

      if (clusters.length > 0) {
        summary += `You have ${clusters.length} distinct legacy themes emerging.`;
      }

      return summary || 'Your legacy is still being written. Continue building meaningful experiences.';
    } catch (error) {
      logger.error({ error }, 'Failed to generate legacy summary');
      return 'Unable to generate legacy summary at this time.';
    }
  }
}

