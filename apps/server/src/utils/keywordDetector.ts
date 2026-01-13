// Messages that should NOT be saved as journal entries (trivial/greeting messages)
const EXCLUDE_PATTERNS = [
  /^(hi|hey|hello|thanks|thank you|thx|ok|okay|yes|no|yep|nope|sure|alright|cool|nice|great|awesome)$/i,
  /^(hi|hey|hello|thanks|thank you|thx|ok|okay|yes|no|yep|nope|sure|alright|cool|nice|great|awesome)\s*[!.,]*$/i,
  /^(\?|!|\.|,)+$/, // Only punctuation
];

// Minimum length for a message to be considered worth saving
const MIN_MESSAGE_LENGTH = 3;

/**
 * Determines if a chat message is truly trivial and should be excluded.
 * 
 * This is MORE PERMISSIVE than shouldPersistMessage - only excludes:
 * - Very short messages (< 3 characters)
 * - Trivial single-word greetings/responses (hi, ok, thanks, lol, 👍)
 * - Messages that are only punctuation
 * 
 * Everything else gets saved and processed through the ingestion pipeline.
 */
export const isTrivialMessage = (message: string): boolean => {
  const trimmed = message.trim().toLowerCase();
  
  // Don't save empty or very short messages
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return true;
  }
  
  // Only exclude truly trivial single-word responses
  const trivialWords = ['hi', 'hey', 'ok', 'okay', 'lol', 'thanks', 'thx', '👍', 'yes', 'no', 'yep', 'nope'];
  if (trivialWords.includes(trimmed)) {
    return true;
  }
  
  // Exclude only punctuation
  if (/^(\?|!|\.|,)+$/.test(trimmed)) {
    return true;
  }
  
  // Everything else is worth processing
  return false;
};

/**
 * Determines if a chat message should be automatically saved as a journal entry.
 * 
 * By default, ALL chat messages are saved EXCEPT:
 * - Very short messages (< 3 characters)
 * - Trivial greetings/responses (hi, thanks, ok, etc.)
 * - Messages that are only punctuation
 * 
 * This makes journaling as easy as chatting - everything is automatically captured.
 * 
 * @deprecated Use isTrivialMessage() instead - this is kept for backward compatibility
 */
export const shouldPersistMessage = (message: string): boolean => {
  return !isTrivialMessage(message);
};

export const extractTags = (message: string) => {
  const matches = message.match(/#(\w+)/g) ?? [];
  return matches.map((tag) => tag.replace('#', '').toLowerCase());
};
