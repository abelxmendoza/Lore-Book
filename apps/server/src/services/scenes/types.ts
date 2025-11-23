/**
 * Scene Generator Engine Type Definitions
 */

export interface RawSceneSignal {
  memoryId: string;
  text: string;
  timestamp: string;
}

export interface Scene {
  id?: string;
  title: string;
  type: string;
  setting: string;
  timeContext: string;
  mood: string;
  emotionalArc: string[];
  beats: SceneBeat[];
  characters: SceneCharacter[];
  interactions: SceneInteraction[];
  outcome: string;
  summary: string;
  embedding: number[];
  timestamp: string;
  memory_id?: string;
  user_id?: string;
  created_at?: string;
}

export interface SceneBeat {
  action: string;
  intensity: number; // 0-1
}

export interface SceneCharacter {
  name: string;
  role: string;
  description?: string;
}

export interface SceneInteraction {
  speaker?: string;
  target?: string;
  action: string;
  emotion?: string;
}

