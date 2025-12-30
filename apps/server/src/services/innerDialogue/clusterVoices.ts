import { randomUUID } from 'crypto';

import { embeddingService } from '../embeddingService';
import type { InnerVoice, VoiceCluster } from './types';

export class VoiceClusterer {
  async cluster(voices: InnerVoice[]): Promise<VoiceCluster[]> {
    if (voices.length < 2) return [];

    const embeddings = await Promise.all(voices.map((v) => embeddingService.embedText(v.text)));

    const k = Math.min(3, voices.length);

    const clusters: VoiceCluster[] = Array.from({ length: k }, () => ({
      id: randomUUID(),
      label: '',
      members: [],
      centroid: [],
    }));

    voices.forEach((v, i) => {
      clusters[i % k].members.push(v);
    });

    // Compute centroids
    clusters.forEach((c, idx) => {
      if (c.members.length === 0) return;

      const vecs = c.members.map((m) => {
        const voiceIndex = voices.findIndex((v) => v.id === m.id);
        return embeddings[voiceIndex];
      });

      if (vecs.length > 0 && vecs[0].length > 0) {
        const centroid = vecs[0].map((_, col) => vecs.reduce((sum, v) => sum + v[col], 0) / vecs.length);
        c.centroid = centroid;
      }
      c.label = `Voice Cluster ${idx + 1}`;
    });

    // Filter out empty clusters
    return clusters.filter((c) => c.members.length > 0);
  }
}

