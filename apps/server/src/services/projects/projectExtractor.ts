import { config } from '../../config';
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { openai as openaiClient } from '../openaiClient';
import { lexicalAnalyzerService } from '../lexical';
import { projectService } from '../projectService';
import {
  buildCrossBookIndexForUser,
  canonicalProjectKey,
  isRejectedProjectSuggestionName,
  type ProjectSuggestionOptions,
  processProjectSuggestionsForOutput,
  projectSuggestionsToExtracted,
  weakProjectCandidate,
} from '../lexical/projects';

export type ExtractedProject = {
  name: string;
  description?: string;
  type?: string;
  status?: 'active' | 'paused' | 'completed' | 'abandoned';
  confidence: number;
  reasoning?: string;
  evidence?: string[];
};

function inferActiveThreadProject(
  message: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): string | undefined {
  const corpus = [message, ...(conversationHistory ?? []).map(m => m.content)].join('\n').toLowerCase();
  if (/\blorebook\b|\blore book\b/.test(corpus)) return 'LoreBook';
  if (/\bomega-?1\b/.test(corpus)) return 'Omega-1';
  if (/\bomega-?2\b/.test(corpus)) return 'Omega-2';
  if (/\babeliciousness\b/.test(corpus)) return 'Abeliciousness';
  return undefined;
}

async function buildProjectSuggestionOptions(
  userId: string,
  message: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  knownProjectNames: string[] = []
): Promise<ProjectSuggestionOptions> {
  const [crossBook, projects] = await Promise.all([
    buildCrossBookIndexForUser(userId).catch(() => undefined),
    projectService.listProjects(userId).catch(() => []),
  ]);
  const knownProjects = new Set([...knownProjectNames, ...projects.map(p => p.name)]);
  const knownProjectIds = new Map(
    projects.map(p => [canonicalProjectKey(p.name), p.id] as const)
  );
  return {
    knownProjects,
    knownProjectIds,
    activeThreadProject: inferActiveThreadProject(message, conversationHistory),
    crossBook,
  };
}

const STOP_NAMES = new Set([
  'i', 'me', 'my', 'the', 'a', 'an', 'this', 'that', 'it', 'we', 'our', 'today', 'yesterday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  // Bare gerund/common verbs the glossary can mistake for a project name.
  'building', 'working', 'making', 'doing', 'planning', 'starting', 'creating', 'developing',
  'designing', 'writing', 'recording', 'producing', 'launching', 'shipping',
]);

const QUICK_PROJECT_SIGNAL =
  /\b(project|app|startup|business|building|working on|developing|creating|launching|shipping|designing|prototyping|recording|producing|milestone|deployed|released|lorebook)\b/i;

// Keyword → project type classification. First match wins, so order by specificity.
const TYPE_KEYWORDS: Array<{ re: RegExp; type: string }> = [
  { re: /\b(app|application|website|web app|platform|saas|software|api|dashboard|code|coding|programming|repo|deploy(?:ed|ing)?|backend|frontend|feature|bug|ship(?:ped|ping)?)\b/i, type: 'software' },
  { re: /\b(startup|business|company|venture|founders?|fundrais\w*|revenue|customers?|clients?|launch(?:ed|ing)? a product)\b/i, type: 'business' },
  { re: /\b(album|ep\b|song|track|mixtape|record(?:ing)?|paint\w*|novel|writing|short story|film|video|design(?:ing)?|portfolio|art\b)\b/i, type: 'creative' },
  { re: /\b(training|workout|gym|marathon|5k|10k|lift(?:ing)?|mma|jiu[- ]?jitsu|boxing|fitness|cut\b|bulk\b)\b/i, type: 'fitness' },
  { re: /\b(course|class|bootcamp|certification|degree|studying|learning|tutorial|exam)\b/i, type: 'education' },
  { re: /\b(career|new job|onboarding|promotion|interview|internship|ramp[- ]?up|new role)\b/i, type: 'career' },
];

// Keyword → lifecycle status. First match wins.
const STATUS_CUES: Array<{ re: RegExp; status: NonNullable<ExtractedProject['status']> }> = [
  { re: /\b(shipped|launched|finished|completed|released|wrapped up|delivered|went live|done with)\b/i, status: 'completed' },
  { re: /\b(paused|on hold|shelv(?:ed|ing)|took a break|stepped away|back ?burner)\b/i, status: 'paused' },
  { re: /\b(abandon(?:ed|ing)?|gave up on|scrapp?ed|killed (?:off|it)|quit|walked away from)\b/i, status: 'abandoned' },
];

/** Classify a project's type from its name + surrounding text, preferring an explicit cue type. */
function inferProjectType(name: string, context: string, fallback?: string): string {
  const hay = `${name} ${context}`;
  for (const { re, type } of TYPE_KEYWORDS) {
    if (re.test(hay)) return type;
  }
  return fallback ?? 'project';
}

/** Infer lifecycle status from lexical cues in the surrounding text. Defaults to active. */
function inferProjectStatus(context: string): NonNullable<ExtractedProject['status']> {
  for (const { re, status } of STATUS_CUES) {
    if (re.test(context)) return status;
  }
  return 'active';
}

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
  const key = canonicalProjectKey(project.name);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push(project);
}

/**
 * Fast lexical + boundary-aware project extraction (no LLM).
 */
export function extractProjectsLexical(
  text: string,
  options?: ProjectSuggestionOptions
): ExtractedProject[] {
  const trimmed = text.trim();
  if (trimmed.length < 8 || !QUICK_PROJECT_SIGNAL.test(trimmed)) return [];

  const weakCandidates = [];
  const analysis = lexicalAnalyzerService.analyzeMessage({
    userId: 'project-extractor',
    messageId: `project-extract:${normalizeNameKey(trimmed).slice(0, 24) || 'unknown'}`,
    text: trimmed,
  });

  for (const entity of analysis.entities.filter(e => e.type === 'PROJECT')) {
    weakCandidates.push(
      weakProjectCandidate(entity.surface, trimmed, Math.min(0.72, entity.confidence * 0.85))
    );
  }

  const status = inferProjectStatus(trimmed);
  const pipeline = processProjectSuggestionsForOutput(trimmed, options, weakCandidates);
  const out: ExtractedProject[] = [];
  const seen = new Set<string>();

  for (const item of projectSuggestionsToExtracted(pipeline)) {
    if (isRejectedProjectSuggestionName(item.name, options)) continue;
    pushUnique(out, seen, {
      name: item.name,
      type: item.type ?? inferProjectType(item.name, trimmed),
      status,
      confidence: item.confidence,
      reasoning: item.reasoning ?? 'Detected from project language in your message',
      evidence: item.evidence ?? [trimmed.slice(0, 120)],
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

export class ProjectExtractor {
  extractFromText(text: string, options?: ProjectSuggestionOptions): ExtractedProject[] {
    return extractProjectsLexical(text, options);
  }

  async extractProjectsFromMessage(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ExtractedProject[]> {
    const options = await buildProjectSuggestionOptions(userId, message, conversationHistory);
    const lexical = extractProjectsLexical(message, options);
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
        if (isRejectedProjectSuggestionName(name, options)) continue;
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
        if (isRejectedProjectSuggestionName(name)) continue;
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
