export type ExternalSource = 'github' | 'instagram' | 'x' | 'calendar' | 'photos';

export interface ExternalEvent {
  source: ExternalSource;
  timestamp: string;
  type: string;
  text?: string;
  imageUrl?: string;
  tags?: string[];
  milestone?: string | null;
  summary?: string;
  characters?: string[];
}

export interface ExternalSummary extends ExternalEvent {
  summary: string;
}
