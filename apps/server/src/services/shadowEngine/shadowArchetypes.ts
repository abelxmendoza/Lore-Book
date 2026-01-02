import type { ShadowArchetypeScore, ShadowSignal } from './shadowTypes';

export const computeShadowArchetypes = (signals: ShadowSignal[]): ShadowArchetypeScore => {
  const scores: ShadowArchetypeScore = {
    Saboteur: 0,
    InnerCritic: 0,
    PhantomLover: 0,
    Villain: 0,
    WoundedChild: 0,
    GhostSelf: 0,
    Addict: 0,
    PrideLord: 0,
    Monster: 0,
    LoneWolf: 0,
  };

  for (const sig of signals) {
    if (sig.type === 'self_sabotage') scores.Saboteur += sig.intensity;
    if (sig.type === 'shame' || sig.type === 'guilt') scores.WoundedChild += sig.intensity;
    if (sig.type === 'envy' || sig.type === 'jealousy') scores.InnerCritic += sig.intensity;
    if (sig.type === 'power_projection') scores.PrideLord += sig.intensity;
    if (sig.type === 'resentment') scores.Villain += sig.intensity;
    if (sig.type === 'avoidance') scores.GhostSelf += sig.intensity;
    if (sig.type === 'identity_mask') scores.LoneWolf += sig.intensity;
    if (sig.type === 'anger_suppressed') scores.Monster += sig.intensity;
  }

  // Normalize scores (optional - keep raw for now)
  return scores;
};

