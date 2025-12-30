/**
 * Engine Runtime Type Definitions
 */

export interface EngineContext {
  entries: any[];
  relationships?: any[];
  goals?: any[];
  habits?: any[];
  user: {
    id: string;
  };
  now: Date;
}

export interface EngineResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

export interface EngineResults {
  [engineName: string]: EngineResult;
}

export type EngineFunction = (userId: string, ctx: EngineContext) => Promise<any>;

