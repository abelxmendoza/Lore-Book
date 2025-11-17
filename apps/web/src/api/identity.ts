import { fetchJson } from '../lib/api';

export type IdentityPulse = {
  persona: string;
  motifs: { name: string; energy: number }[];
  emotionTrajectory: { label: string; value: number }[];
  stability: number;
  driftWarnings: string[];
};

export const fetchIdentityPulse = () => fetchJson<{ pulse: IdentityPulse }>('/api/identity/pulse');
