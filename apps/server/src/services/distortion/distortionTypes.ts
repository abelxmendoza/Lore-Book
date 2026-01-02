export type DistortionType =
  | 'catastrophizing'
  | 'romantic_projection'
  | 'mind_reading'
  | 'fortune_telling'
  | 'personalization'
  | 'emotional_reasoning'
  | 'idealization'
  | 'devaluation'
  | 'all_or_nothing'
  | 'overgeneralization'
  | 'shame_spiral'
  | 'fear_amplification'
  | 'hero_fantasy'
  | 'villain_fantasy'
  | 'spotlight_effect'
  | 'self_dooming'
  | 'other_dooming'
  | 'control_fallacy'
  | 'comparison_fallacy';

export interface DistortionSignal {
  id: string;
  type: DistortionType;
  triggerPhrase: string;
  evidence: string;
  timestamp: string;
  severity: number;
  confidence: number;
}

