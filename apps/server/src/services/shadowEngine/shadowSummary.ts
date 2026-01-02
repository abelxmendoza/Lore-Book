import type { ShadowArchetypeScore, ShadowLoop, ShadowProjection, ShadowTriggers } from './shadowTypes';

export const buildShadowSummary = (
  archetypes: ShadowArchetypeScore,
  loops: ShadowLoop[],
  triggers: ShadowTriggers,
  projection: ShadowProjection
): string => {
  const activeTriggers = Object.entries(triggers)
    .filter(([_, active]) => active)
    .map(([key]) => key.replace('_trigger', ''));

  return `
Your shadow patterns reveal a dominant **${projection.dominant_future}** influence.

Key loops detected: ${loops.map((l) => l.loop).join(', ') || 'None'}

Triggers active: ${activeTriggers.join(', ') || 'None'}

Trajectory: ${projection.projection}

Recommended focus: ${projection.recommended_focus}
  `.trim();
};

