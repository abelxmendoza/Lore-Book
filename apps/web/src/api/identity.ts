import { fetchJson } from '../lib/api';

export type IdentityStatus = 'stable' | 'shifting' | 'exploring' | 'turbulent';

export type IdentitySnapshot = {
  label: string;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
};

export type TimelineData = {
  date: string;
  themes: Array<{ name: string; strength: number }>;
};

export type MotifEvolution = {
  name: string;
  sparkline: number[];
  peakMarkers: Array<{ date: string; intensity: number }>;
};

export type IdentityStatement = {
  text: string;
  confidence: number;
  date: string;
  timeSpan: string;
};

export type ReflectiveInsight = {
  text: string;
  category: string;
  score: number;
  question?: string;
};

export type IdentityPulse = {
  status: IdentityStatus;
  stability: number;
  driftScore: number;
  moodVolatility: number;
  timeRange: number;
  totalMemories: number;
  snapshot: IdentitySnapshot[];
  timeline: TimelineData[];
  motifEvolution: MotifEvolution[];
  identityStatements: IdentityStatement[];
  insights: ReflectiveInsight[];
  summary: string;
};

export const fetchIdentityPulse = (timeRange: string = '30') => 
  fetchJson<IdentityPulse>(`/api/analytics/identity?timeRange=${timeRange}`);
