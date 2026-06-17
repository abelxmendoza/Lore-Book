/**
 * Scene Detection — discover recurring life scenes from co-occurring cues (ontology + patterns).
 */
import { randomUUID } from 'crypto';

import { discoverEntities } from '../ontology/lexicalIntelligence';
import type { EnrichedLifeArc } from '../continuityRuntime/arcs/lifeArcSynthesisService';
import type { NarrativeScene } from './types';

type SceneRule = {
  title: string;
  arcCategory: string;
  cues: RegExp[];
  minHits: number;
};

const SCENE_RULES: SceneRule[] = [
  {
    title: 'Latino Goth Scene',
    arcCategory: 'community',
    cues: [/\bclub metro\b/i, /\bgoth\b/i, /\bwarehouse show\b/i, /\bfirst street pool\b/i, /\blos goths\b/i],
    minHits: 2,
  },
  {
    title: 'Career Rebuild',
    arcCategory: 'career',
    cues: [/\bamazon\b/i, /\brecruiter\b/i, /\bbackground check\b/i, /\bonboarding\b/i, /\bkforce\b/i],
    minHits: 2,
  },
  {
    title: 'Family Arc',
    arcCategory: 'family',
    cues: [/\babuela\b/i, /\bt[ií]a\b/i, /\bt[ií]o\b/i, /\bcousin\b/i, /\bfamily\b/i],
    minHits: 2,
  },
  {
    title: 'LoreBook Build',
    arcCategory: 'creative',
    cues: [/\blorebook\b/i, /\blorekeeper\b/i, /\bmemory (system|engine)\b/i],
    minHits: 1,
  },
  {
    title: 'Learning Sprint',
    arcCategory: 'learning',
    cues: [/\bbootcamp\b/i, /\bcoding\b/i, /\bclever programmer\b/i, /\bimprov\b/i],
    minHits: 2,
  },
];

function collectCorpus(arcs: EnrichedLifeArc[]): string {
  return arcs.flatMap((a) => a.evidence).join('\n');
}

export function detectScenes(arcs: EnrichedLifeArc[]): NarrativeScene[] {
  const corpus = collectCorpus(arcs);
  const scenes: NarrativeScene[] = [];

  for (const rule of SCENE_RULES) {
    const matchedCues: string[] = [];
    const evidence: string[] = [];
    for (const cue of rule.cues) {
      const m = corpus.match(cue);
      if (m) {
        matchedCues.push(m[0]);
        evidence.push(m[0]);
      }
    }
    if (matchedCues.length < rule.minHits) continue;
    scenes.push({
      id: randomUUID(),
      title: rule.title,
      arcCategory: rule.arcCategory,
      cues: matchedCues,
      confidence: Math.min(0.95, 0.5 + matchedCues.length * 0.15),
      evidence: [...new Set(evidence)].slice(0, 8),
    });
  }

  // Ontology-discovered entities as supplemental scenes
  const discovered = discoverEntities(corpus).slice(0, 5);
  for (const d of discovered) {
    if (d.category !== 'SCENE' && d.category !== 'COMMUNITY' && d.category !== 'SUBCULTURE') continue;
    scenes.push({
      id: randomUUID(),
      title: d.name,
      arcCategory: d.domain.toLowerCase(),
      cues: [d.surface],
      confidence: d.confidence,
      evidence: [d.surface],
    });
  }

  const seen = new Set<string>();
  return scenes.filter((s) => {
    if (seen.has(s.title)) return false;
    seen.add(s.title);
    return true;
  });
}
