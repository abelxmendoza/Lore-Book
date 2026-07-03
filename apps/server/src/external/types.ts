export type ExternalSource = 'github' | 'instagram' | 'x' | 'calendar' | 'photos';

export interface ExternalEvent {
  source: ExternalSource;
  sourceId?: string;
  timestamp: string;
  type: string;
  text?: string;
  imageUrl?: string;
  url?: string;
  tags?: string[];
  milestone?: string | null;
  summary?: string;
  characters?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExternalSummary extends ExternalEvent {
  summary: string;
}
