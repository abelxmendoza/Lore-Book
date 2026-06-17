/** Structured resume parse result — canonical shape for lore population. */

export type ResumeContact = {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  linkedin?: string;
};

export type ResumeEmployment = {
  company: string;
  title: string;
  location?: string;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string;
};

export type ResumeEducation = {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string;
};

export type ResumeProject = {
  name: string;
  description?: string;
  technologies?: string[];
  startDate?: string | null;
  endDate?: string | null;
  url?: string;
};

export type ResumeCertification = {
  name: string;
  issuer?: string;
  date?: string | null;
};

export type ResumeEmploymentGap = {
  startDate: string;
  endDate: string;
  label: string;
};

export type ParsedResume = {
  contact: ResumeContact;
  summary?: string;
  employment: ResumeEmployment[];
  education: ResumeEducation[];
  skills: string[];
  projects: ResumeProject[];
  certifications: ResumeCertification[];
  employmentGaps: ResumeEmploymentGap[];
};

export type ResumeLorePopulationResult = {
  journalEntries: number;
  timelineEvents: number;
  skills: number;
  organizations: number;
  facts: number;
  characterAttributes: number;
  entryIds: string[];
  eventIds: string[];
};
