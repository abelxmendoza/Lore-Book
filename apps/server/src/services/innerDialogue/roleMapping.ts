import type { InnerVoice } from './types';

export class RoleMapping {
  refineRole(voice: InnerVoice): InnerVoice {
    // simple heuristic: future_self overrides others
    if (/future me|future self/i.test(voice.text)) {
      voice.role = 'future_self';
      voice.confidence += 0.1;
    }

    return voice;
  }
}

