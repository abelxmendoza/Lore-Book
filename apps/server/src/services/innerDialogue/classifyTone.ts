import type { InnerVoice } from './types';

export class ToneClassifier {
  detectTone(text: string): InnerVoice['tone'] {
    const toneMap = [
      { tone: 'harsh', regex: /(stupid|idiot|weak)/i },
      { tone: 'supportive', regex: /(you got this|keep going|proud of you)/i },
      { tone: 'anxious', regex: /(what if|i'm worried|scared)/i },
      { tone: 'confident', regex: /(i can|i will|i'm ready)/i },
      { tone: 'aggressive', regex: /(fight|hit back|break)/i },
      { tone: 'fearful', regex: /(they'll reject me|i'll lose)/i },
    ];

    for (const t of toneMap) {
      if (t.regex.test(text)) return t.tone as InnerVoice['tone'];
    }

    return 'neutral';
  }
}

