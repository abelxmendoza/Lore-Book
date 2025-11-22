import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';
import type { LegacySignal, LegacyCluster, LegacyDomain } from './types';

/**
 * Clusters legacy signals into themes using Python
 */
export class LegacyClusterer {
  /**
   * Cluster signals into themes
   */
  async cluster(signals: LegacySignal[]): Promise<LegacyCluster[]> {
    try {
      if (signals.length === 0) {
        return [];
      }

      // Use Python bridge for clustering
      const result = await spawnPython('legacy.clustering:cluster', {
        signals: signals.map(s => ({
          id: s.id,
          text: s.text,
          domain: s.domain,
          intensity: s.intensity,
          direction: s.direction,
        })),
      });

      // Convert Python results to LegacyCluster format
      const clusters: LegacyCluster[] = [];

      if (result?.clusters && Array.isArray(result.clusters)) {
        for (const cluster of result.clusters) {
          // Find signals in this cluster
          const clusterSignals = signals.filter(s => 
            cluster.signal_ids?.includes(s.id) || 
            cluster.signalIds?.includes(s.id)
          );

          if (clusterSignals.length > 0) {
            clusters.push({
              id: cluster.id || crypto.randomUUID(),
              theme: cluster.theme || cluster.name || 'Unnamed Theme',
              keywords: cluster.keywords || [],
              signals: clusterSignals,
              significance: cluster.significance || this.calculateSignificance(clusterSignals),
              domain: cluster.domain || clusterSignals[0]?.domain,
              metadata: {
                python_cluster: cluster,
                signal_count: clusterSignals.length,
              },
            });
          }
        }
      }

      logger.debug({ signals: signals.length, clusters: clusters.length }, 'Clustered legacy signals');

      return clusters;
    } catch (error) {
      logger.error({ error }, 'Failed to cluster legacy signals');
      // Return basic clustering by domain
      return this.fallbackClustering(signals);
    }
  }

  /**
   * Calculate significance for a cluster
   */
  private calculateSignificance(signals: LegacySignal[]): number {
    if (signals.length === 0) return 0;

    const positive = signals.filter(s => s.direction === 1).length;
    const negative = signals.filter(s => s.direction === -1).length;
    const avgIntensity = signals.reduce((sum, s) => sum + s.intensity, 0) / signals.length;

    // Significance based on signal count, intensity, and direction
    const directionScore = (positive - negative) / signals.length;
    return Math.max(0, Math.min(1, (avgIntensity + directionScore) / 2));
  }

  /**
   * Fallback clustering when Python is unavailable
   */
  private fallbackClustering(signals: LegacySignal[]): LegacyCluster[] {
    const clusters: LegacyCluster[] = [];
    const domainMap = new Map<LegacyDomain, LegacySignal[]>();

    // Group by domain
    for (const signal of signals) {
      if (!domainMap.has(signal.domain)) {
        domainMap.set(signal.domain, []);
      }
      domainMap.get(signal.domain)!.push(signal);
    }

    // Create clusters from domains
    for (const [domain, domainSignals] of domainMap) {
      if (domainSignals.length >= 2) {
        clusters.push({
          id: crypto.randomUUID(),
          theme: `${domain} Legacy`,
          keywords: [domain],
          signals: domainSignals,
          significance: this.calculateSignificance(domainSignals),
          domain,
          metadata: {
            method: 'fallback',
            domain_based: true,
          },
        });
      }
    }

    return clusters;
  }
}

