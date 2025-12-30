import type { ShadowArchetypeScore, ShadowProjection } from './shadowTypes';

export const projectShadowTrajectory = (archetypes: ShadowArchetypeScore): ShadowProjection => {
  const entries = Object.entries(archetypes);
  if (entries.length === 0) {
    return {
      dominant_future: 'Unknown',
      risk_level: 0,
      projection: 'No shadow patterns detected.',
      recommended_focus: 'awareness',
    };
  }

  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const dominantScore = sorted[0][1];

  let recommendedFocus = 'awareness';
  if (dominant === 'Saboteur') {
    recommendedFocus = 'consistency';
  } else if (dominant === 'InnerCritic') {
    recommendedFocus = 'self-compassion';
  } else if (dominant === 'WoundedChild') {
    recommendedFocus = 'healing';
  } else if (dominant === 'Villain') {
    recommendedFocus = 'forgiveness';
  } else if (dominant === 'PrideLord') {
    recommendedFocus = 'humility';
  }

  return {
    dominant_future: dominant,
    risk_level: Math.min(1, dominantScore / 10), // Normalize risk level
    projection: `If unaddressed, the ${dominant} continues to shape behavior.`,
    recommended_focus: recommendedFocus,
  };
};

