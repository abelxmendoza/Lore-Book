import type { BiasSignal } from './types';

export class BiasClassifier {
  refine(signal: BiasSignal): BiasSignal {
    if (/always|never/.test(signal.text)) {
      signal.biasType = 'black_white_thinking';
    }
    if (/my fault/.test(signal.text)) {
      signal.biasType = 'personalization';
    }
    if (/everyone saw/.test(signal.text)) {
      signal.biasType = 'spotlight_effect';
    }

    signal.confidence += 0.1;
    return signal;
  }
}

