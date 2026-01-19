import { randomUUID } from 'crypto';

import { embeddingService } from '../embeddingService';

import type { SelfCluster, SelfStatement } from './types';

export class SelfClusterer {
  async cluster(selves: SelfStatement[]): Promise<SelfCluster[]> {
    if (selves.length < 2) return [];

    const embeddings = await Promise.all(selves.map((s) => embeddingService.embedText(s.text)));
    const k = Math.min(4, selves.length);

    const clusters: SelfCluster[] = Array.from({ length: k }, (_, i) => ({
      id: randomUUID(),
      label: `Self Cluster ${i + 1}`,
      members: [],
      centroid: [],
    }));

    selves.forEach((s, i) => {
      clusters[i % k].members.push(s);
    });

    // Compute centroids
    clusters.forEach((c, idx) => {
      if (c.members.length === 0) return;

      const vecs = c.members.map((m) => {
        const selfIndex = selves.findIndex((s) => s.id === m.id);
        return embeddings[selfIndex];
      });

      if (vecs.length > 0 && vecs[0].length > 0) {
        const centroid = vecs[0].map((_, col) => vecs.reduce((sum, v) => sum + v[col], 0) / vecs.length);
        c.centroid = centroid;
      }
    });

    // Filter out empty clusters
    return clusters.filter((c) => c.members.length > 0);
  }
}

