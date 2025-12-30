import type { ShadowLoop, ShadowSignal } from './shadowTypes';

export const detectShadowLoops = (signals: ShadowSignal[]): ShadowLoop[] => {
  const loops: ShadowLoop[] = [];

  const sabotageLoop =
    signals.some((s) => s.type === 'self_sabotage') && signals.some((s) => s.type === 'avoidance');
  if (sabotageLoop) {
    loops.push({ loop: 'Sabotage → Avoidance → Shame', risk: 0.9 });
  }

  const jealousyLoop =
    signals.some((s) => s.type === 'jealousy') && signals.some((s) => s.type === 'ego_defense');
  if (jealousyLoop) {
    loops.push({ loop: 'Jealousy → Ego Defense → Conflict', risk: 0.75 });
  }

  const shameGuiltLoop =
    signals.some((s) => s.type === 'shame') && signals.some((s) => s.type === 'guilt');
  if (shameGuiltLoop) {
    loops.push({ loop: 'Shame → Guilt → Self-Sabotage', risk: 0.8 });
  }

  const resentmentPowerLoop =
    signals.some((s) => s.type === 'resentment') && signals.some((s) => s.type === 'power_projection');
  if (resentmentPowerLoop) {
    loops.push({ loop: 'Resentment → Power Projection → Conflict', risk: 0.7 });
  }

  return loops;
};

