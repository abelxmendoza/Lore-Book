import { randomUUID } from 'crypto';

import { embeddingService } from '../embeddingService';

import type { ParacosmCluster, ParacosmSignal } from './types';

/**
 * Clusters paracosm signals using embeddings
 * V2 Lite: Simple k-means clustering
 */
export class ParacosmClusterer {
  async cluster(signals: ParacosmSignal[]): Promise<ParacosmCluster[]> {
    if (signals.length < 2) return [];

    const embeddings = await Promise.all(signals.map((s) => embeddingService.embedText(s.text)));

    // naive clustering (k=3)
    const k = Math.min(3, signals.length);
    const clusters: ParacosmCluster[] = Array.from({ length: k }).map(() => ({
      id: randomUUID(),
      label: '',
      members: [],
      centroid: [],
    }));

    // assign round-robin (simple)
    signals.forEach((sig, i) => {
      clusters[i % k].members.push(sig);
    });

    // compute centroids
    clusters.forEach((c, idx) => {
      if (c.members.length === 0) return;
      
      const vecs = c.members.map((m) => {
        const signalIndex = signals.findIndex((s) => s.id === m.id);
        return embeddings[signalIndex];
      });
      
      if (vecs.length > 0 && vecs[0].length > 0) {
        const centroid = vecs[0].map((_, col) => vecs.reduce((sum, v) => sum + v[col], 0) / vecs.length);
        c.centroid = centroid;
      }
      c.label = `Cluster ${idx + 1}`;
    });

    // Filter out empty clusters
    return clusters.filter((c) => c.members.length > 0);
  }
}

