/**
 * Paracosm Engine V2 Lite Type Definitions
 */

export type ParacosmCategory =
  | 'imagined_person'
  | 'imagined_group'
  | 'future_scenario'
  | 'alternate_self'
  | 'fantasy_world'
  | 'intrusive_thought'
  | 'ideal_self'
  | 'fear_scenario'
  | 'simulation'
  | 'dream_state';

export interface ParacosmSignal {
  id: string;
  text: string;
  timestamp: string;
  category: ParacosmCategory;
  confidence: number;
}

export interface ParacosmCluster {
  id: string;
  label: string;
  members: ParacosmSignal[];
  centroid: number[];
}

export interface ParacosmModel {
  id: string;
  signals: ParacosmSignal[];
  clusters: ParacosmCluster[];
}

