import { logger } from '../logger';
import type { ClaimType, ExtractedFact, FactExtractionResult } from './factExtractionService';

/**
 * Rule-based fact extraction - NO API CALLS, completely free
 * Uses regex patterns, NLP rules, and pattern matching
 */
class RuleBasedFactExtractionService {
  // Date patterns
  private readonly datePatterns = [
    /(\d{4}-\d{2}-\d{2})/g, // ISO dates: 2024-01-15
    /(\d{1,2}\/\d{1,2}\/\d{4})/g, // US dates: 1/15/2024
    /(\d{1,2}-\d{1,2}-\d{4})/g, // US dates: 1-15-2024
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi, // "January 15, 2024"
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}/gi, // "Jan 15, 2024"
    /(today|yesterday|tomorrow|last week|next week|this month|last month)/gi, // Relative dates
  ];

  // Location patterns
  private readonly locationPatterns = [
    /\b(in|at|from|to|near|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, // "in Seattle", "at New York"
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g, // "Seattle, WA"
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Street|Avenue|Road|Boulevard|Drive|Lane|Way|Court|Place)\b/gi, // Addresses
  ];

  // Name patterns (capitalized words that aren't common words)
  private readonly namePatterns = [
    /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g, // "John Smith"
    /\b([A-Z][a-z]+)\b/g, // Single capitalized names
  ];

  // Common words to exclude from names
  private readonly excludedWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'this', 'that', 'these', 'those', 'here', 'there', 'where', 'when', 'what', 'who', 'why', 'how',
    'today', 'yesterday', 'tomorrow', 'now', 'then', 'soon', 'later',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  ]);

  // Relationship patterns
  private readonly relationshipPatterns = [
    /\b(friend|friends|buddy|buddy|pal|mate)\b/gi,
    /\b(family|parent|parents|mother|father|mom|dad|sister|brother|sibling|siblings)\b/gi,
    /\b(colleague|co-worker|coworker|boss|manager|employee|teammate|team)\b/gi,
    /\b(met|meet|meeting|know|knows|knew|introduced|introduce)\b/gi,
    /\b(dating|dating|boyfriend|girlfriend|partner|spouse|husband|wife)\b/gi,
  ];

  // Event patterns
  private readonly eventPatterns = [
    /\b(went|go|going|traveled|travel|visited|visit|attended|attend|participated|participate)\b/gi,
    /\b(worked|work|working|completed|complete|finished|finish|started|start|began|begin)\b/gi,
    /\b(created|create|made|make|built|build|developed|develop|designed|design)\b/gi,
    /\b(learned|learn|studied|study|read|reading|wrote|write|watching|watch)\b/gi,
  ];

  /**
   * Extract facts using rule-based patterns - NO API CALLS
   */
  async extractFacts(content: string): Promise<FactExtractionResult> {
    const facts: ExtractedFact[] = [];
    const lowerContent = content.toLowerCase();

    // Extract dates
    const dates = this.extractDates(content);
    dates.forEach(date => {
      facts.push({
        claim_type: 'date',
        subject: 'I',
        attribute: 'event_date',
        value: date,
        confidence: 0.8,
        context: this.getContext(content, date)
      });
    });

    // Extract locations
    const locations = this.extractLocations(content);
    locations.forEach(location => {
      facts.push({
        claim_type: 'location',
        subject: 'I',
        attribute: 'location',
        value: location,
        confidence: 0.7,
        context: this.getContext(content, location)
      });
    });

    // Extract character names
    const characters = this.extractCharacters(content);
    characters.forEach(character => {
      facts.push({
        claim_type: 'character',
        subject: character,
        attribute: 'mentioned',
        value: 'true',
        confidence: 0.6,
        context: this.getContext(content, character)
      });
    });

    // Extract relationships
    const relationships = this.extractRelationships(content);
    relationships.forEach(rel => {
      facts.push({
        claim_type: 'relationship',
        subject: rel.character || 'I',
        attribute: 'relationship',
        value: rel.type,
        confidence: 0.7,
        context: this.getContext(content, rel.text)
      });
    });

    // Extract events
    const events = this.extractEvents(content);
    events.forEach(event => {
      facts.push({
        claim_type: 'event',
        subject: 'I',
        attribute: 'event',
        value: event,
        confidence: 0.6,
        context: this.getContext(content, event)
      });
    });

    // Deduplicate facts
    const uniqueFacts = this.deduplicateFacts(facts);

    return {
      facts: uniqueFacts,
      extraction_confidence: uniqueFacts.length > 0 ? 0.7 : 0.3
    };
  }

  private extractDates(content: string): string[] {
    const dates = new Set<string>();
    
    for (const pattern of this.datePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const dateStr = match[1] || match[0];
        if (dateStr) {
          // Try to normalize date
          const normalized = this.normalizeDate(dateStr);
          if (normalized) {
            dates.add(normalized);
          } else {
            dates.add(dateStr.trim());
          }
        }
      }
    }

    return Array.from(dates);
  }

  private normalizeDate(dateStr: string): string | null {
    try {
      // Try to parse and normalize to ISO format
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Ignore parsing errors
    }
    return null;
  }

  private extractLocations(content: string): string[] {
    const locations = new Set<string>();
    
    for (const pattern of this.locationPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const location = match[2] || match[1];
        if (location && location.length > 2) {
          locations.add(location.trim());
        }
      }
    }

    return Array.from(locations);
  }

  private extractCharacters(content: string): string[] {
    const characters = new Set<string>();
    
    // Extract capitalized names (likely people)
    for (const pattern of this.namePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const name = match[0] || match[1];
        const lowerName = name.toLowerCase();
        
        // Exclude common words and very short names
        if (name.length > 2 && !this.excludedWords.has(lowerName) && !this.isCommonWord(lowerName)) {
          characters.add(name.trim());
        }
      }
    }

    return Array.from(characters);
  }

  private isCommonWord(word: string): boolean {
    // Additional common words check
    const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'];
    return commonWords.includes(word.toLowerCase());
  }

  private extractRelationships(content: string): Array<{ character?: string; type: string; text: string }> {
    const relationships: Array<{ character?: string; type: string; text: string }> = [];
    const lowerContent = content.toLowerCase();

    // Find relationship mentions
    for (const pattern of this.relationshipPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const relType = match[0].toLowerCase();
        let relationshipType = 'other';
        
        if (relType.includes('friend')) relationshipType = 'friend';
        else if (relType.includes('family') || relType.includes('parent') || relType.includes('sibling')) relationshipType = 'family';
        else if (relType.includes('colleague') || relType.includes('coworker') || relType.includes('boss') || relType.includes('team')) relationshipType = 'professional';
        else if (relType.includes('dating') || relType.includes('boyfriend') || relType.includes('girlfriend') || relType.includes('partner')) relationshipType = 'romantic';
        else if (relType.includes('met') || relType.includes('know')) relationshipType = 'acquaintance';

        // Try to extract character name near relationship mention
        const contextStart = Math.max(0, match.index! - 50);
        const contextEnd = Math.min(content.length, match.index! + match[0].length + 50);
        const context = content.substring(contextStart, contextEnd);
        const characterMatch = context.match(/\b([A-Z][a-z]+)\b/);
        const character = characterMatch ? characterMatch[1] : undefined;

        relationships.push({
          character,
          type: relationshipType,
          text: match[0]
        });
      }
    }

    return relationships;
  }

  private extractEvents(content: string): string[] {
    const events = new Set<string>();
    
    for (const pattern of this.eventPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        // Extract verb phrase
        const verb = match[0];
        const contextStart = Math.max(0, match.index! - 20);
        const contextEnd = Math.min(content.length, match.index! + verb.length + 50);
        const phrase = content.substring(contextStart, contextEnd).trim();
        
        if (phrase.length > 10 && phrase.length < 100) {
          events.add(phrase);
        }
      }
    }

    return Array.from(events).slice(0, 5); // Limit to 5 events
  }

  private getContext(content: string, searchTerm: string): string {
    const index = content.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (index === -1) return '';
    
    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + searchTerm.length + 30);
    return content.substring(start, end).trim();
  }

  private deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
    const seen = new Set<string>();
    const unique: ExtractedFact[] = [];

    for (const fact of facts) {
      const key = `${fact.subject.toLowerCase()}:${fact.attribute.toLowerCase()}:${fact.value.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(fact);
      }
    }

    return unique;
  }
}

export const ruleBasedFactExtractionService = new RuleBasedFactExtractionService();

