/**
 * Highlights search matches in text
 */
export const highlightMatches = (text: string, query: string): string => {
  if (!query.trim()) return text;
  
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark class="bg-primary/30 text-primary">$1</mark>');
};

/**
 * Finds all matches in text and returns positions
 */
export const findMatchPositions = (text: string, query: string): Array<{ start: number; end: number }> => {
  if (!query.trim()) return [];
  
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches: Array<{ start: number; end: number }> = [];
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  return matches;
};

