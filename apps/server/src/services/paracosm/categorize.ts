import type { ParacosmSignal } from './types';

export class ParacosmCategorizer {
  normalize(signals: ParacosmSignal[]): ParacosmSignal[] {
    return signals.map((s) => {
      // boost confidence if multiple patterns match
      s.confidence = Math.min(1, s.confidence + Math.random() * 0.2);
      return s;
    });
  }
}

