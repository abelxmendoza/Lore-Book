/**
 * Smart query parser that extracts filters from natural language queries
 */

export type ParsedQuery = {
  query: string;
  filters: {
    timeStart?: string;
    timeEnd?: string;
    tags?: string[];
    characters?: string[];
    motifs?: string[];
  };
};

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const RELATIVE_TIME_PATTERNS = [
  { pattern: /today/i, days: 0 },
  { pattern: /yesterday/i, days: 1 },
  { pattern: /last\s+week/i, days: 7 },
  { pattern: /this\s+week/i, days: 0 },
  { pattern: /last\s+month/i, days: 30 },
  { pattern: /this\s+month/i, days: 0 },
  { pattern: /last\s+year/i, days: 365 },
  { pattern: /this\s+year/i, days: 0 },
];

export const parseQuery = (input: string): ParsedQuery => {
  let query = input.trim();
  const filters: ParsedQuery['filters'] = {};

  // Extract date ranges - check relative time patterns first
  for (const { pattern, days } of RELATIVE_TIME_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      filters.timeStart = start.toISOString().split('T')[0];
      filters.timeEnd = end.toISOString().split('T')[0];
      query = query.replace(pattern, '').trim();
      break;
    }
  }

  // Extract explicit date ranges if no relative pattern matched
  if (!filters.timeStart) {
    const dateRangePatterns = [
      // "from X to Y" or "between X and Y"
      /(?:from|between)\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4}|\w+\s+\d{4})\s+(?:to|and)\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4}|\w+\s+\d{4})/i,
      // "in March 2024" or "during March 2024"
      /(?:in|during)\s+(\w+)\s+(\d{4})/i,
      // "in March" (current year assumed)
      /(?:in|during)\s+(\w+)(?:\s+(\d{4}))?/i
    ];

    for (const pattern of dateRangePatterns) {
      const match = query.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          // Try to parse dates
          const startDate = parseDate(match[1]);
          const endDate = parseDate(match[2]);
          if (startDate) filters.timeStart = startDate;
          if (endDate) filters.timeEnd = endDate;
        } else if (match[1]) {
          // Single month/year
          const monthMatch = match[1].match(/(\w+)\s+(\d{4})/);
          if (monthMatch) {
            const monthName = monthMatch[1].toLowerCase();
            const year = parseInt(monthMatch[2]);
            const monthIndex = MONTHS.indexOf(monthName);
            if (monthIndex !== -1) {
              const start = new Date(year, monthIndex, 1);
              const end = new Date(year, monthIndex + 1, 0);
              filters.timeStart = start.toISOString().split('T')[0];
              filters.timeEnd = end.toISOString().split('T')[0];
            }
          } else {
            // Just month name - use current year
            const monthName = match[1].toLowerCase();
            const monthIndex = MONTHS.indexOf(monthName);
            if (monthIndex !== -1) {
              const now = new Date();
              const year = now.getFullYear();
              const start = new Date(year, monthIndex, 1);
              const end = new Date(year, monthIndex + 1, 0);
              filters.timeStart = start.toISOString().split('T')[0];
              filters.timeEnd = end.toISOString().split('T')[0];
            }
          }
        }
        query = query.replace(pattern, '').trim();
        break;
      }
    }
  }

  // Extract characters (e.g., "involving Kai", "with Sarah", "about John")
  const characterPatterns = [
    /(?:involving|with|about|mentioning)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /(?:character|person|people)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
  ];

  const characters: string[] = [];
  for (const pattern of characterPatterns) {
    const matches = query.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        characters.push(match[1].trim());
        query = query.replace(match[0], '').trim();
      }
    }
  }
  if (characters.length > 0) {
    filters.characters = [...new Set(characters)];
  }

  // Extract tags (e.g., "tagged work", "about robotics", "related to coding")
  const tagPatterns = [
    /(?:tagged|tag)\s+([a-z]+(?:\s+[a-z]+)*)/gi,
    /(?:about|related\s+to)\s+([a-z]+(?:\s+[a-z]+)*)/gi
  ];

  const tags: string[] = [];
  for (const pattern of tagPatterns) {
    const matches = query.matchAll(pattern);
    for (const match of matches) {
      if (match[1] && !characters.includes(match[1])) {
        tags.push(match[1].trim());
        query = query.replace(match[0], '').trim();
      }
    }
  }
  if (tags.length > 0) {
    filters.tags = [...new Set(tags)];
  }

  // Extract motifs (e.g., "moments of clarity", "breakthroughs", "epiphanies")
  const motifKeywords = [
    'breakthrough', 'breakthroughs', 'clarity', 'epiphany', 'epiphanies',
    'insight', 'insights', 'realization', 'realizations', 'discovery',
    'momentum', 'transformation', 'shift', 'turning point'
  ];

  const motifs: string[] = [];
  for (const keyword of motifKeywords) {
    const pattern = new RegExp(`(?:moments?\\s+of\\s+)?${keyword}s?`, 'gi');
    if (pattern.test(query)) {
      motifs.push(keyword);
      query = query.replace(pattern, '').trim();
    }
  }
  if (motifs.length > 0) {
    filters.motifs = [...new Set(motifs)];
  }

  // Clean up query (remove extra spaces, common filter words)
  query = query
    .replace(/\s+/g, ' ')
    .replace(/\b(?:in|during|from|to|between|and|involving|with|about|tagged|tag|related\s+to)\b/gi, '')
    .trim();

  return { query, filters };
};

const parseDate = (dateStr: string): string | null => {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try "Month Day, Year" format
  const monthDayYear = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (monthDayYear) {
    const monthName = monthDayYear[1].toLowerCase();
    const day = parseInt(monthDayYear[2]);
    const year = parseInt(monthDayYear[3]);
    const monthIndex = MONTHS.indexOf(monthName);
    if (monthIndex !== -1) {
      const date = new Date(year, monthIndex, day);
      return date.toISOString().split('T')[0];
    }
  }

  // Try "Month Year" format
  const monthYear = dateStr.match(/(\w+)\s+(\d{4})/);
  if (monthYear) {
    const monthName = monthYear[1].toLowerCase();
    const year = parseInt(monthYear[2]);
    const monthIndex = MONTHS.indexOf(monthName);
    if (monthIndex !== -1) {
      const date = new Date(year, monthIndex, 1);
      return date.toISOString().split('T')[0];
    }
  }

  return null;
};

