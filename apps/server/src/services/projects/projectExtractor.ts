import { config } from '../../config';
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { openai as openaiClient } from '../openaiClient';
import { lexicalAnalyzerService } from '../lexical';

export type ExtractedProject = {
  name: string;
  description?: string;
  type?: string;
  status?: 'active' | 'paused' | 'completed' | 'abandoned';
  confidence: number;
  reasoning?: string;
  evidence?: string[];
};

const PROJECT_CUE_PATTERNS: Array<{ re: RegExp; confidence: number; type?: string }> = [
  { re: /\b(?:working on|building|developing|creating|launching|shipping)\s+(?:the\s+)?([A-Z][\w'&.-]{1,48}(?:\s+[A-Z][\w'&.-]{1,24}){0,3})/g, confidence: 0.82, type: 'software' },
  { re: /\b(?:my|our)\s+(?:side\s+)?project\s+(?:called\s+)?["']?([A-Z][\w'&.-]{1,48}(?:\s+[A-Z][\w'&.-]{1,24}){0,2})/gi, confidence: 0.88, type: 'project' },
  { re: /\bproject\s+(?:called|named)\s+["']?([A-Z][\w'&.-]{1,48}(?:\s+[A-Z][\w'&.-]{1,24}){0,2})/gi, confidence: 0.9, type: 'project' },
  { re: /\b(?:app|startup|business)\s+(?:called\s+)?["']?([A-Z][\w'&.-]{1,40})/gi, confidence: 0.85, type: 'software' },
  { re: /\b(lorebook|lore book)\b/gi, confidence: 0.92, type: 'software' },
];

const STOP_NAMES = new Set([
  'i', 'me', 'my', 'the', 'a', 'an', 'this', 'that', 'it', 'we', 'our', 'today', 'yesterday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

const QUICK_PROJECT_SIGNAL =
  /\b(project|app|startup|business|building|working on|developing|creating|launching|shipping|milestone|deployed|lorebook)\b/i;

function cleanProjectName(raw: string): string | null {
  const name = raw
    .replace(/^["']|["']$/g, '')
    .replace(/\s+(app|project|startup|business)$/i, '')
    .trim();
  if (!name || name.length < 2 || name.length > 80) return null;
  if (STOP_NAMES.has(name.toLowerCase())) return null;
  return name;
}

function pushUnique(out: ExtractedProject[], seen: Set<string>, project: ExtractedProject): void {
  const key = normalizeNameKey(project.name);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(project);
}

/**
 * Fast lexical + cue-based project extraction (no LLM).
 */
export function extractProjectsLexical(text: string): ExtractedProject[] {
  const out: ExtractedProject[] = [];
  const seen = new Set<string>();
  const trimmed = text.trim();
  if (trimmed.length < 8) return out;
  if (!QUICK_PROJECT_SIGNAL.test(trimmed)) return out;

  const analysis = lexicalAnalyzerService.analyzeMessage({
    userId: 'project-extractor',
    messageId: `project-extract:${normalizeNameKey(trimmed).slice(0, 24) || 'unknown'}`,
    text: trimmed,
  });

  for (const { re, confidence, type } of PROJECT_CUE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      const captured = m[1] ?? m[0];
      const name = cleanProjectName(captured);
      if (!name) continue;
      pushUnique(out, seen, {
        name: name.toLowerCase() === 'lore book' ? 'LoreBook' : name,
        type,
        confidence,
        reasoning: 'Detected from project language in your message',
        evidence: [m[0].trim().slice(0, 120)],
      });
    }
  }

  for (const event of analysis.events) {
    if (event.kind !== 'project_milestone') continue;
    const subject = event.subject?.trim();
    if (subject) {
      const name = cleanProjectName(subject);
      if (name) {
        pushUnique(out, seen, {
          name,
          type: 'project',
          confidence: Math.max(0.75, event.confidence),
          reasoning: 'Project milestone detected in conversation',
          evidence: [event.cue],
        });
      }
    }
  }

  for (const entity of analysis.entities.filter((e) => e.type === 'PROJECT')) {
    const name = cleanProjectName(entity.surface);
    if (!name) continue;
    pushUnique(out, seen, {
      name,
      type: 'project',
      confidence: entity.confidence,
      reasoning: 'Initiative detected via lexical intelligence',
      evidence: [entity.source ?? trimmed.slice(0, 80)],
    });
  }

  for (const candidate of analysis.ontologyCandidates) {
    if (candidate.objectType !== 'EVENT' || candidate.object !== 'project_milestone') continue;
    pushUnique(out, seen, {
      name: 'Project milestone',
      type: 'project',
      confidence: candidate.confidence,
      reasoning: 'Project milestone detected in conversation',
      evidence: [candidate.source],
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

export class ProjectExtractor {
  extractFromText(text: string): ExtractedProject[] {
    return extractProjectsLexical(text);
  }

  async extractProjectsFromMessage(
    _userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ExtractedProject[]> {
    const lexical = extractProjectsLexical(message);
    if (lexical.length > 0 || message.trim().length < 40) return lexical;

    try {
      const context = (conversationHistory ?? [])
        .slice(-6)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract life projects the user is working on, building, launching, or maintaining.
A project is an ongoing initiative — apps, startups, fitness goals framed as projects, career ramps, creative builds.
Return JSON: { "projects": [{ "name": "short title", "description": "one line", "type": "software|career|fitness|hobby|creative|project", "status": "active|paused|completed", "confidence": 0.0-1.0 }] }
Only include projects clearly stated. Max 4. Skip generic tasks and one-off chores.`,
          },
          {
            role: 'user',
            content: `Recent context:\n${context}\n\nLatest message:\n${message}`,
          },
        ],
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const projects = (parsed.projects ?? []) as ExtractedProject[];
      const seen = new Set(lexical.map((p) => normalizeNameKey(p.name)));
      for (const p of projects) {
        const name = cleanProjectName(p.name);
        if (!name || (p.confidence ?? 0.6) < 0.5) continue;
        pushUnique(lexical, seen, {
          name,
          description: p.description,
          type: p.type ?? 'project',
          status: p.status ?? 'active',
          confidence: Math.min(1, Number(p.confidence ?? 0.65)),
          reasoning: 'Detected from conversation context',
          evidence: [message.slice(0, 120)],
        });
      }
    } catch (error) {
      logger.debug({ error }, 'LLM project extraction failed — lexical only');
    }

    return lexical.slice(0, 6);
  }

  async extractProjects(
    _userId: string,
    entries: Array<{ content: string; date?: string }>
  ): Promise<ExtractedProject[]> {
    if (entries.length === 0) return [];

    const lexicalAll: ExtractedProject[] = [];
    const seen = new Set<string>();
    for (const entry of entries.slice(0, 40)) {
      for (const p of extractProjectsLexical(entry.content)) {
        pushUnique(lexicalAll, seen, p);
      }
    }
    if (lexicalAll.length >= 3) return lexicalAll.slice(0, 12);

    try {
      const recent = entries.slice(0, 30).map((e) => ({ content: e.content, date: e.date }));
      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract ongoing life projects from journal/chat snippets.
Return JSON: { "projects": [{ "name", "description", "type", "status", "confidence" }] }
Projects are sustained initiatives (apps, career ramps, training programs, creative builds). Not daily todos.`,
          },
          { role: 'user', content: JSON.stringify(recent, null, 2) },
        ],
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      for (const p of (parsed.projects ?? []) as ExtractedProject[]) {
        const name = cleanProjectName(p.name);
        if (!name || (p.confidence ?? 0.6) < 0.5) continue;
        pushUnique(lexicalAll, seen, {
          name,
          description: p.description,
          type: p.type ?? 'project',
          status: p.status ?? 'active',
          confidence: Number(p.confidence ?? 0.68),
          reasoning: 'Detected from your recent story',
        });
      }
    } catch (error) {
      logger.warn({ error }, 'Batch project extraction failed');
    }

    return lexicalAll.slice(0, 12);
  }
}

export const projectExtractor = new ProjectExtractor();
