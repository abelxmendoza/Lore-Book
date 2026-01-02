export type SelfType =
  | 'past_self'
  | 'future_self'
  | 'ideal_self'
  | 'shadow_self'
  | 'feared_self'
  | 'public_self'
  | 'private_self'
  | 'relationship_self'
  | 'warrior_self'
  | 'creator_self'
  | 'healed_self'
  | 'broken_self'
  | 'unknown';

export interface SelfStatement {
  id: string;
  text: string;
  timestamp: string;
  selfType: SelfType;
  confidence: number;
}

export interface SelfCluster {
  id: string;
  label: string;
  members: SelfStatement[];
  centroid: number[];
}

export interface SelfTrajectory {
  dominantSelf: SelfType;
  risingSelves: SelfType[];
  fadingSelves: SelfType[];
  volatility: number;
}

export interface AlternateSelfModel {
  selves: SelfStatement[];
  clusters: SelfCluster[];
  trajectory: SelfTrajectory;
}

