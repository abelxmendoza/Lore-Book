type DisplayTitleInput = {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  date?: string | null;
  source?: string | null;
  fallbackNoun?: string;
  people?: string[];
  locations?: string[];
};

const DATE_ONLY_PATTERNS = [
  /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
  /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?$/i,
  /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+\d{4})?$/i,
  /^(today|yesterday|tomorrow)$/i,
];

const DATE_PREFIX_PATTERNS = [
  /^(chat|conversation|memory|journal entry|entry|event|moment)\s*(from|on|for)?\s*[:\-–—]?\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}$/i,
  /^(chat|conversation|memory|journal entry|entry|event|moment)\s*(from|on|for)?\s*[:\-–—]?\s*\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/i,
  /^(chat|conversation|memory|journal entry|entry|event|moment)\s*(from|on|for)?\s*[:\-–—]?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i,
];

const GENERIC_TITLE_PATTERNS = [
  /^(untitled|new chat|new conversation|chat|conversation|journal entry|entry|memory|event|moment)$/i,
  /^(chat|conversation|journal entry|entry|memory|event|moment)\s+\d+$/i,
];

export function isWeakDisplayTitle(value?: string | null): boolean {
  const title = value?.trim();
  if (!title) return true;
  if (DATE_ONLY_PATTERNS.some(pattern => pattern.test(title))) return true;
  if (DATE_PREFIX_PATTERNS.some(pattern => pattern.test(title))) return true;
  if (GENERIC_TITLE_PATTERNS.some(pattern => pattern.test(title))) return true;
  return false;
}

function cleanSourceText(value: string): string {
  return value
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(user|assistant|system|summary|content|date)\s*:\s*/gi, ' ')
    .replace(/^(hi|hey|hello|yo|so|okay|ok|um|well)[,!.\s]+/i, '')
    .replace(/^(today|yesterday|tonight|this morning|this afternoon|this evening)\s*,?\s*/i, '')
    .replace(/^(i|we)\s+(talked|spoke|chatted|were talking)\s+(about|with)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceFromText(value?: string | null): string | null {
  const cleaned = cleanSourceText(value ?? '');
  if (!cleaned) return null;

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.replace(/[.!?]+$/, '').trim())
    .filter(sentence => sentence.length >= 12 && !isWeakDisplayTitle(sentence));

  const candidate = sentences[0] ?? cleaned;
  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;

  const shortened = words.slice(0, 10).join(' ');
  const withEllipsis = words.length > 10 ? `${shortened}…` : shortened;
  return withEllipsis.charAt(0).toUpperCase() + withEllipsis.slice(1);
}

function formatDateLabel(date?: string | null): string {
  if (!date) return 'recent conversation';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'recent conversation';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getDisplayTitle(input: DisplayTitleInput): string {
  if (!isWeakDisplayTitle(input.title)) return input.title!.trim();

  const fromSummary = sentenceFromText(input.summary);
  if (fromSummary) return fromSummary;

  const fromContent = sentenceFromText(input.content);
  if (fromContent) return fromContent;

  if (input.people?.length) {
    const names = input.people.slice(0, 2).join(input.people.length > 1 ? ' and ' : '');
    return input.source === 'chat' ? `Conversation with ${names}` : `Memory with ${names}`;
  }

  if (input.locations?.length) return `Memory at ${input.locations[0]}`;

  return `${input.fallbackNoun ?? 'Memory'} from ${formatDateLabel(input.date)}`;
}
