export interface InnerVoice {
  id: string;
  text: string;
  timestamp: string;
  role:
    | 'critic'
    | 'coach'
    | 'warrior'
    | 'shadow'
    | 'skeptic'
    | 'hype'
    | 'mentor'
    | 'child_self'
    | 'future_self'
    | 'other';
  tone:
    | 'harsh'
    | 'supportive'
    | 'anxious'
    | 'confident'
    | 'neutral'
    | 'curious'
    | 'aggressive'
    | 'fearful';
  confidence: number;
}

export interface VoiceCluster {
  id: string;
  label: string;
  members: InnerVoice[];
  centroid: number[];
}

export interface InnerDialogueModel {
  voices: InnerVoice[];
  clusters: VoiceCluster[];
}

