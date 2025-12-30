export type BiasType =
  | 'confirmation_bias'
  | 'catastrophizing'
  | 'mind_reading'
  | 'emotional_reasoning'
  | 'black_white_thinking'
  | 'overgeneralization'
  | 'personalization'
  | 'projection'
  | 'halo_effect'
  | 'spotlight_effect'
  | 'optimism_bias'
  | 'negativity_bias'
  | 'self_serving_bias'
  | 'unknown';

export interface BiasSignal {
  id: string;
  biasType: BiasType;
  text: string;
  timestamp: string;
  confidence: number;
  evidence: string;
  weight?: number;
}

export interface BiasProfile {
  dominantBiases: BiasType[];
  allBiases: BiasSignal[];
  impactScore: number;
  summary: string;
}

