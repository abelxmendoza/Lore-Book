import type { MemoryEntry } from '../../types';
import { extractShadowSignals } from './shadowSignals';
import { computeShadowArchetypes } from './shadowArchetypes';
import { detectShadowLoops } from './shadowLoops';
import { detectShadowTriggers } from './shadowTriggers';
import { projectShadowTrajectory } from './shadowProjection';
import { buildShadowSummary } from './shadowSummary';
import { saveShadowProfile } from './shadowStorage';
import type { ShadowProfile } from './shadowTypes';

export class ShadowEngine {
  async process(userId: string, entries: MemoryEntry[], save: boolean = true): Promise<ShadowProfile> {
    // Extract all shadow signals from entries
    const allSignals = entries.flatMap((e) => {
      const text = e.content || e.summary || '';
      return extractShadowSignals(text);
    });

    // Compute shadow archetypes
    const archetypes = computeShadowArchetypes(allSignals);

    // Detect shadow loops
    const loops = detectShadowLoops(allSignals);

    // Detect triggers from all entry text
    const allText = entries.map((e) => e.content || e.summary || '').join(' ');
    const triggers = detectShadowTriggers(allText);

    // Project shadow trajectory
    const projection = projectShadowTrajectory(archetypes);

    // Build summary
    const summary = buildShadowSummary(archetypes, loops, triggers, projection);

    const profile: ShadowProfile = {
      shadow_archetypes: archetypes,
      dominant_shadow: projection.dominant_future,
      shadow_loops: loops,
      shadow_triggers: triggers,
      conflict_map: {}, // optional V2 extension
      projection,
      summary,
    };

    if (save) {
      await saveShadowProfile(userId, profile);
    }

    return profile;
  }
}

