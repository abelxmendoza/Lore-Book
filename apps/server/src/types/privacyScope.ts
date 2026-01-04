/**
 * LORE-KEEPER PRIVACY, SCOPE & MEMORY OWNERSHIP ENGINE
 * TypeScript Types
 */

export type ScopeType = 'PRIVATE' | 'SHARED' | 'ANONYMOUS' | 'ARCHIVED' | 'DELETED';

export type ResourceType =
  | 'CLAIM'
  | 'DECISION'
  | 'INSIGHT'
  | 'PREDICTION'
  | 'GOAL'
  | 'VALUE'
  | 'EVENT'
  | 'ENTITY'
  | 'RELATIONSHIP'
  | 'OUTCOME'
  | 'SIGNAL'
  | 'SNAPSHOT';

export interface MemoryScope {
  id: string;
  scope_type: ScopeType;
  description: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ScopedResource {
  id: string;
  resource_type: ResourceType;
  resource_id: string;
  scope_id: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface RequesterContext {
  user_id: string;
  is_owner?: boolean;
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
}

export interface ChatVisibleState {
  claims: any[];
  insights: any[];
  decisions: any[];
  predictions: any[];
  goals: any[];
  values: any[];
  entities: any[];
}

export interface ExportData {
  claims: any[];
  decisions: any[];
  outcomes: any[];
  goals: any[];
  values: any[];
  insights: any[];
  predictions: any[];
  scopes: ScopedResource[];
  exported_at: string;
}

