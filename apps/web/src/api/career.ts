import { fetchJson } from '../lib/api';

export type CareerSummary = {
  generatedAt: string;
  hasResumeData: boolean;
  currentRole: { title: string; company: string; startDate?: string | null } | null;
  contact: {
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  employment: Array<{
    company: string;
    title: string;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean;
  }>;
  education: Array<{ institution: string; degree?: string; field?: string }>;
  employmentGaps: Array<{ startDate: string; endDate: string; label: string }>;
  skills: Array<{ id: string; name: string; category: string; fromResume: boolean }>;
  employers: Array<{ id: string; name: string; status?: string }>;
  timeline: Array<{
    id: string;
    kind: string;
    title: string;
    subtitle?: string;
    startDate: string | null;
    endDate: string | null;
    source: string;
  }>;
  stats: {
    jobCount: number;
    schoolCount: number;
    skillCount: number;
    employerCount: number;
    unverifiedClaims: number;
    resumeUploadCount: number;
    timelineEventCount: number;
  };
  latestResume: {
    documentId: string;
    fileId: string | null;
    fileName: string;
    uploadedAt: string;
  } | null;
};

export async function fetchCareerSummary(): Promise<CareerSummary | null> {
  try {
    const res = await fetchJson<{ success: boolean; summary: CareerSummary }>('/api/career/summary');
    return res.success ? res.summary : null;
  } catch {
    return null;
  }
}
