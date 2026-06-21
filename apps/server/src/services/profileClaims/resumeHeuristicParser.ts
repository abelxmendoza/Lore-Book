/**
 * Heuristic resume parser — deterministic extraction for Abel-style and common US resume layouts.
 * Reference resumes:
 *   AbelMendoza_RoboticsEngineer_Resume2026-1.pdf
 *   AbelMendoza_Amazon_FailureAnalysisTechnician_Resume.pdf
 */
import type { ParsedResume, ResumeCertification, ResumeEmployment, ResumeProject } from './resumeStructuredTypes';
import { parseDateRange, parseMonthYearToken } from './resumeDateUtils';

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const JOB_DATE_RE = new RegExp(
  `^(.+?)\\s+(${MONTH}\\s+\\d{4})\\s*[–—-]\\s*(Present|Current|${MONTH}\\s+\\d{4})`,
  'i'
);

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.\w+/;
const PHONE_RE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const LINKEDIN_RE = /linkedin\.com\/in\/[\w-]+/i;

function normalizeContactBlock(text: string): string {
  return text.replace(/\[([^\]]+@[^\]]+)\]\(mailto:[^)]+\)/gi, '$1');
}

function extractContact(text: string): ParsedResume['contact'] {
  const lines = text.split('\n').slice(0, 8);
  const block = normalizeContactBlock(lines.join('\n'));
  const fullName = lines[0]?.trim().match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/) ? lines[0].trim() : undefined;
  return {
    fullName,
    email: block.match(EMAIL_RE)?.[0],
    phone: block.match(PHONE_RE)?.[0],
    address: lines.find((l) => /\b[A-Z][a-z]+,\s*CA\b/.test(l))?.trim(),
    website: block.match(/\b([\w-]+\.(?:com|dev|io|me))\b/i)?.[1],
    linkedin: block.match(LINKEDIN_RE)?.[0],
  };
}

function extractEmployment(text: string): ResumeEmployment[] {
  const jobs: ResumeEmployment[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(JOB_DATE_RE);
    if (!m) continue;

    const title = m[1].trim();
    const { start, end, isCurrent } = parseDateRange(`${m[2]} – ${m[3]}`);

    let company = '';
    let location = '';
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const line = lines[j];
      if (JOB_DATE_RE.test(line) || /^(Technical|Professional|Education|Additional)/i.test(line)) break;
      if (line.startsWith('•')) break;
      if (!company && (line.includes('—') || line.includes(',') || /Inc\.|Robotics|Industries/i.test(line))) {
        const dash = line.split(/\s{0,40}[—–-]\s{0,40}/);
        if (dash.length >= 2) {
          company = dash[0].replace(/,\s*$/, '').trim();
          location = dash.slice(1).join(' — ').trim();
        } else {
          const comma = line.split(',');
          company = comma[0].trim();
          location = comma.slice(1).join(',').trim();
        }
        break;
      }
    }

    if (!company) continue;

    const bullets: string[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const line = lines[j];
      if (JOB_DATE_RE.test(line) || /^(Technical Projects|Education|Additional)/i.test(line)) break;
      if (line.startsWith('•')) bullets.push(line.replace(/^•\s*/, ''));
      else if (!line.startsWith('•') && bullets.length > 0) break;
    }

    jobs.push({
      company,
      title,
      location: location || undefined,
      startDate: start,
      endDate: end,
      isCurrent,
      description: bullets.slice(0, 4).join(' '),
    });
  }

  return jobs;
}

function extractEducation(text: string): ParsedResume['education'] {
  const edu: ParsedResume['education'] = [];
  const eduBlock = text.split(/Education/i)[1]?.split(/Additional|Technical Projects/i)[0] ?? '';
  const lines = eduBlock.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const combined = lines[i].match(/^(.{1,120}?)\s+(May|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
    if (combined) {
      edu.push({
        institution: combined[1].trim(),
        endDate: parseMonthYearToken(`${combined[2]} ${combined[3]}`),
      });
    }
    if (/Bachelor|Master|Associate|B\.S\.|M\.S\./i.test(lines[i])) {
      edu.push({
        institution: lines[i - 1] ?? 'School',
        degree: lines[i],
      });
    }
  }

  const seen = new Set<string>();
  return edu.filter((e) => {
    const key = `${e.institution}|${e.degree ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSkills(text: string): string[] {
  const block = text.split(/Technical Skills/i)[1]?.split(/Professional Experience/i)[0] ?? '';
  const skills = new Set<string>();
  for (const line of block.split('\n')) {
    const afterColon = line.split(':').slice(1).join(':');
    if (!afterColon) continue;
    for (const part of afterColon.split(/[,|]/)) {
      const s = part.trim().replace(/\.$/, '');
      if (s.length > 1 && s.length < 60) skills.add(s);
    }
  }
  return [...skills].slice(0, 40);
}

function extractProjects(text: string): ResumeProject[] {
  const block = text.split(/Technical Projects/i)[1]?.split(/Education/i)[0] ?? '';
  const projects: ResumeProject[] = [];
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('—') && !lines[i].startsWith('•')) {
      const name = lines[i].split(/[|—]/)[0].trim();
      const techLine = lines[i + 1]?.includes('|') ? lines[i + 1] : undefined;
      const bullets = lines.slice(i + 1).filter((l) => l.startsWith('•')).map((l) => l.replace(/^•\s*/, ''));
      if (name.length > 2) {
        projects.push({
          name,
          description: bullets[0],
          technologies: techLine?.split('|').map((t) => t.trim()) ?? [],
        });
      }
    }
  }
  return projects.slice(0, 8);
}

function extractCertifications(text: string): ResumeCertification[] {
  const certs: ResumeCertification[] = [];
  if (/FAA Part 107/i.test(text)) certs.push({ name: 'FAA Part 107 Certified' });
  if (/ITAR\/EAR/i.test(text)) certs.push({ name: 'ITAR/EAR Eligible (U.S. Citizen)' });
  return certs;
}

function extractSummary(text: string): string | undefined {
  const block = text.split(/Professional Summary/i)[1]?.split(/Technical Skills/i)[0];
  return block?.replace(/\s+/g, ' ').trim().slice(0, 500) || undefined;
}

export function parseResumeHeuristics(text: string): ParsedResume {
  return {
    contact: extractContact(text),
    summary: extractSummary(text),
    employment: extractEmployment(text),
    education: extractEducation(text),
    skills: extractSkills(text),
    projects: extractProjects(text),
    certifications: extractCertifications(text),
    employmentGaps: [],
  };
}

export function mergeParsedResume(llm: ParsedResume, heuristics: ParsedResume): ParsedResume {
  return {
    contact: { ...heuristics.contact, ...pickNonEmpty(llm.contact) },
    summary: llm.summary || heuristics.summary,
    employment: llm.employment.length >= heuristics.employment.length ? llm.employment : heuristics.employment,
    education: llm.education.length ? llm.education : heuristics.education,
    skills: [...new Set([...llm.skills, ...heuristics.skills])].slice(0, 50),
    projects: llm.projects.length ? llm.projects : heuristics.projects,
    certifications: [...llm.certifications, ...heuristics.certifications].filter(
      (c, i, arr) => arr.findIndex((x) => x.name === c.name) === i
    ),
    employmentGaps: llm.employmentGaps.length ? llm.employmentGaps : heuristics.employmentGaps,
  };
}

function pickNonEmpty(contact: ParsedResume['contact']): ParsedResume['contact'] {
  const out: ParsedResume['contact'] = {};
  for (const [k, v] of Object.entries(contact)) {
    if (v) (out as Record<string, string>)[k] = v;
  }
  return out;
}
