export type ConnectionStage =
  | 'distant_fan'
  | 'scene_presence'
  | 'brief_contact'
  | 'growing'
  | 'connected';

export type InferredInteraction = {
  type: 'explicit_dialogue' | 'co_event' | 'co_location' | 'scene_context';
  confidence: number;
  evidence: string;
  source: 'chat' | 'journal' | 'event' | 'location';
};

export type PublicFigureConnection = {
  stage: ConnectionStage;
  interactions: InferredInteraction[];
  confidence: number;
  inferred_met: boolean;
  updated_at: string;
};

export type SceneNetworkStatus = {
  score: number;
  tier: 'underground' | 'scene_regular' | 'connector' | 'scene_insider';
  public_figure_count: number;
  deepest_stage: ConnectionStage;
  updated_at: string;
};
