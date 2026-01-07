/**
 * Recall Intent Detector
 * 
 * Fast, lightweight detection of recall-style queries
 * before routing to Memory Recall Engine.
 */

/**
 * Check if a message is a recall query
 */
export function isRecallQuery(text: string): boolean {
  const lowerText = text.toLowerCase().trim();

  const recallPatterns = [
    'when was the last time',
    'when did i',
    'when did you',
    'have i ever',
    'has this happened before',
    'do i usually',
    'is this a pattern',
    'felt like this before',
    'same feeling',
    'again and again',
    'how many times',
    'what happened when',
    'tell me about when',
    'remember when',
    'recall when',
    'find when',
    'search for when',
    'when have i',
    'when was i',
    'similar to',
    'like this before',
  ];

  return recallPatterns.some((pattern) => lowerText.includes(pattern));
}

/**
 * Check if message should force Archivist persona
 */
export function shouldForceArchivist(text: string): boolean {
  const lowerText = text.toLowerCase().trim();

  const archivistPatterns = [
    'when was',
    'when did',
    'how many times',
    'have i ever',
    'what happened',
    'what events',
    'list',
    'show me',
    'find all',
    'search for',
  ];

  return archivistPatterns.some((pattern) => lowerText.includes(pattern));
}

