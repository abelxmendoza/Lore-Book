export interface SelfTheme {
  id: string;
  theme:
    | 'survival'
    | 'rebirth'
    | 'revenge'
    | 'transformation'
    | 'ambition'
    | 'identity'
    | 'connection'
    | 'violence'
    | 'growth'
    | 'self_worth'
    | 'shadow'
    | 'faith'
    | 'purpose';
  evidence: string[];
  strength: number; // 0–1
}

export interface TurningPoint {
  id: string;
  timestamp: string;
  description: string;
  category:
    | 'trauma'
    | 'victory'
    | 'loss'
    | 'awakening'
    | 'shift'
    | 'fall'
    | 'rise'
    | 'betrayal'
    | 'breakthrough';
  emotionalImpact: number; // 0–1
}

export interface NarrativeMode {
  mode:
    | 'warrior'
    | 'loner'
    | 'builder'
    | 'hero'
    | 'antihero'
    | 'outsider'
    | 'sage'
    | 'protector'
    | 'rebel';
  confidence: number; // 0–1
}

export interface StoryArcSegment {
  title: string;
  era: string;
  content: string;
  themes: string[];
}

export interface StoryCoherence {
  coherenceScore: number;
  contradictions: string[];
  missingPieces: string[];
}

export interface StoryOfSelf {
  id: string;
  themes: SelfTheme[];
  turningPoints: TurningPoint[];
  mode: NarrativeMode;
  arcs: StoryArcSegment[];
  coherence: StoryCoherence;
  voicePrint: string;
  summary: string;
}

