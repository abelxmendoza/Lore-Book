import { logger } from '../logger';

/**
 * Rule-based title generation - NO API CALLS, completely free
 * Extracts key phrases and creates titles from content
 */
class RuleBasedTitleGenerationService {
  /**
   * Generate title from content using rule-based extraction
   */
  generateTitle(content: string, maxLength: number = 60): string {
    // Remove extra whitespace
    const cleaned = content.trim().replace(/\s+/g, ' ');

    // Try to extract first sentence (often contains the main idea)
    const firstSentenceMatch = cleaned.match(/^[^.!?]+[.!?]/);
    if (firstSentenceMatch) {
      const firstSentence = firstSentenceMatch[0].trim();
      if (firstSentence.length <= maxLength && firstSentence.length > 10) {
        return this.cleanTitle(firstSentence);
      }
    }

    // Extract key phrases (capitalized words, important nouns)
    const keyPhrases = this.extractKeyPhrases(cleaned);
    if (keyPhrases.length > 0) {
      const title = keyPhrases.slice(0, 3).join(' ');
      if (title.length <= maxLength) {
        return this.cleanTitle(title);
      }
    }

    // Fallback: use first N words
    const words = cleaned.split(' ').slice(0, 8);
    let title = words.join(' ');
    if (title.length > maxLength) {
      title = title.substring(0, maxLength - 3) + '...';
    }
    return this.cleanTitle(title);
  }

  /**
   * Extract key phrases from content
   */
  private extractKeyPhrases(content: string): string[] {
    const phrases: string[] = [];

    // Extract capitalized phrases (likely important)
    const capitalizedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const capitalizedMatches = content.matchAll(capitalizedPattern);
    for (const match of capitalizedMatches) {
      const phrase = match[1];
      if (phrase.length > 3 && phrase.length < 30 && !this.isCommonPhrase(phrase)) {
        phrases.push(phrase);
      }
    }

    // Extract quoted phrases (often important)
    const quotedPattern = /"([^"]+)"/g;
    const quotedMatches = content.matchAll(quotedPattern);
    for (const match of quotedMatches) {
      phrases.push(match[1]);
    }

    // Extract important keywords (nouns, verbs)
    const importantWords = this.extractImportantWords(content);
    phrases.push(...importantWords);

    return phrases;
  }

  /**
   * Extract important words (nouns, verbs, adjectives)
   */
  private extractImportantWords(content: string): string[] {
    const words: string[] = [];
    const wordPattern = /\b([a-z]{4,})\b/gi;
    const matches = content.matchAll(wordPattern);

    const importantKeywords = [
      'meeting', 'project', 'work', 'study', 'learn', 'create', 'build', 'develop',
      'travel', 'visit', 'explore', 'discover', 'achieve', 'complete', 'finish',
      'start', 'begin', 'decide', 'choose', 'plan', 'think', 'feel', 'experience',
      'friend', 'family', 'colleague', 'team', 'group', 'event', 'celebration',
      'challenge', 'problem', 'solution', 'success', 'failure', 'lesson', 'insight'
    ];

    for (const match of matches) {
      const word = match[1].toLowerCase();
      if (importantKeywords.includes(word) && !words.includes(word)) {
        words.push(match[1]); // Keep original case
      }
    }

    return words.slice(0, 5);
  }

  /**
   * Check if phrase is common (should be excluded)
   */
  private isCommonPhrase(phrase: string): boolean {
    const commonPhrases = [
      'The', 'This', 'That', 'These', 'Those', 'There', 'Here', 'Where', 'When',
      'Today', 'Yesterday', 'Tomorrow', 'Now', 'Then', 'Later', 'Soon',
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'
    ];
    return commonPhrases.includes(phrase);
  }

  /**
   * Clean title (remove extra punctuation, capitalize properly)
   */
  private cleanTitle(title: string): string {
    return title
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[^a-zA-Z]+/, '') // Remove leading non-letters
      .replace(/[^a-zA-Z0-9]+$/, '') // Remove trailing non-letters
      .split(' ')
      .map(word => {
        // Capitalize first letter of each word
        if (word.length > 0) {
          return word[0].toUpperCase() + word.slice(1).toLowerCase();
        }
        return word;
      })
      .join(' ')
      .substring(0, 60); // Limit length
  }

  /**
   * Generate title for entry based on content and date
   */
  generateEntryTitle(content: string, date?: string): string {
    const title = this.generateTitle(content);
    
    // If date provided and title is generic, add date context
    if (date && title.length < 20) {
      try {
        const dateObj = new Date(date);
        const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
        const day = dateObj.getDate();
        return `${title} - ${month} ${day}`;
      } catch {
        // Invalid date, just return title
      }
    }

    return title;
  }
}

export const ruleBasedTitleGenerationService = new RuleBasedTitleGenerationService();

