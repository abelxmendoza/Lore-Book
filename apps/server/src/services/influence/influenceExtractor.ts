import { logger } from '../../logger';
import type { InfluenceEvent, InfluenceContext } from './types';

/**
 * Extracts influence events from journal entries
 */
export class InfluenceExtractor {
  /**
   * Extract influence events from context
   */
  extract(ctx: InfluenceContext): InfluenceEvent[] {
    const events: InfluenceEvent[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const people = this.extractPeople(content, ctx);
        const sentiment = entry.sentiment || this.estimateSentiment(content);
        const behaviorTags = this.extractBehaviors(content);

        for (const person of people) {
          events.push({
            id: `infl_${entry.id}_${person}_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            person,
            text: content.substring(0, 500), // Limit text length
            sentiment,
            behavior_tags: behaviorTags,
            entry_id: entry.id,
            metadata: {
              source_entry_id: entry.id,
            },
          });
        }
      }

      logger.debug({ events: events.length, entries: entries.length }, 'Extracted influence events');

      return events;
    } catch (error) {
      logger.error({ error }, 'Failed to extract influence events');
      return [];
    }
  }

  /**
   * Extract people from text
   */
  private extractPeople(text: string, ctx: InfluenceContext): string[] {
    const people: string[] = [];
    const textLower = text.toLowerCase();

    // Common relationship terms
    const relationshipTerms = [
      'mom', 'mother', 'dad', 'father', 'parent', 'parents',
      'brother', 'sister', 'sibling', 'siblings',
      'friend', 'friends', 'buddy', 'pal',
      'boss', 'manager', 'supervisor', 'colleague', 'coworker', 'co-worker',
      'coach', 'teacher', 'mentor', 'advisor',
      'partner', 'spouse', 'husband', 'wife', 'boyfriend', 'girlfriend',
      'roommate', 'neighbor', 'neighbour',
      'doctor', 'therapist', 'counselor',
      'classmate', 'teammate',
    ];

    // Check for relationship terms
    for (const term of relationshipTerms) {
      if (textLower.includes(term)) {
        // Try to extract the actual name or use the term
        const name = this.extractNameNearTerm(text, term);
        if (name && !people.includes(name)) {
          people.push(name);
        } else if (!people.includes(term)) {
          people.push(term);
        }
      }
    }

    // Check relationships data if available
    if (ctx.relationships) {
      const knownPeople = this.getKnownPeople(ctx.relationships);
      for (const person of knownPeople) {
        if (textLower.includes(person.toLowerCase()) && !people.includes(person)) {
          people.push(person);
        }
      }
    }

    // Extract capitalized names (potential person names)
    const namePattern = /\b([A-Z][a-z]+)\b/g;
    const matches = text.match(namePattern);
    if (matches) {
      for (const match of matches) {
        // Filter out common non-person words
        const commonWords = ['I', 'The', 'This', 'That', 'They', 'We', 'You', 'He', 'She', 'It', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        if (!commonWords.includes(match) && !people.includes(match)) {
          people.push(match);
        }
      }
    }

    return people.slice(0, 10); // Limit to 10 people per entry
  }

  /**
   * Extract name near a relationship term
   */
  private extractNameNearTerm(text: string, term: string): string | null {
    const index = text.toLowerCase().indexOf(term);
    if (index === -1) return null;

    // Look for capitalized word before or after the term
    const before = text.substring(Math.max(0, index - 30), index);
    const after = text.substring(index + term.length, index + term.length + 30);

    const namePattern = /\b([A-Z][a-z]+)\b/;
    const beforeMatch = before.match(namePattern);
    const afterMatch = after.match(namePattern);

    if (beforeMatch) return beforeMatch[1];
    if (afterMatch) return afterMatch[1];

    return null;
  }

  /**
   * Get known people from relationships data
   */
  private getKnownPeople(relationships: any): string[] {
    if (!relationships || !Array.isArray(relationships)) return [];

    return relationships
      .map((rel: any) => rel.name || rel.person || rel.character)
      .filter((name: any) => name && typeof name === 'string')
      .slice(0, 50); // Limit to 50 known people
  }

  /**
   * Extract behavior tags from text
   */
  private extractBehaviors(text: string): string[] {
    const tags: string[] = [];
    const textLower = text.toLowerCase();

    // Growth/positive behaviors
    if (
      textLower.includes('gym') ||
      textLower.includes('workout') ||
      textLower.includes('exercise') ||
      textLower.includes('trained') ||
      textLower.includes('training')
    ) {
      tags.push('growth');
    }
    if (
      textLower.includes('study') ||
      textLower.includes('learned') ||
      textLower.includes('reading') ||
      textLower.includes('practiced')
    ) {
      tags.push('growth');
    }
    if (
      textLower.includes('meditate') ||
      textLower.includes('mindfulness') ||
      textLower.includes('yoga')
    ) {
      tags.push('growth');
    }

    // Risk/negative behaviors
    if (
      textLower.includes('drank') ||
      textLower.includes('drinking') ||
      textLower.includes('alcohol') ||
      textLower.includes('party') ||
      textLower.includes('partying')
    ) {
      tags.push('risk');
    }
    if (
      textLower.includes('smoke') ||
      textLower.includes('smoking') ||
      textLower.includes('drug')
    ) {
      tags.push('risk');
    }
    if (
      textLower.includes('skipped') ||
      textLower.includes('missed') ||
      textLower.includes('procrastinated')
    ) {
      tags.push('risk');
    }

    // Social behaviors
    if (
      textLower.includes('social') ||
      textLower.includes('hang out') ||
      textLower.includes('spent time')
    ) {
      tags.push('social');
    }

    return tags;
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun', 'good', 'better', 'best',
      'proud', 'grateful', 'thankful', 'blessed', 'lucky', 'pleased', 'satisfied', 'content',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'anxious', 'stressed', 'tired', 'exhausted',
      'bad', 'worse', 'worst', 'hate', 'regret', 'guilty', 'ashamed', 'embarrassed', 'hurt', 'pain',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

