import { logger } from '../logger';
import { memoryService } from './memoryService';

/**
 * Rule-based tag extraction - NO API CALLS, completely free
 * Uses keyword matching, existing tags database, and pattern recognition
 */
class RuleBasedTagExtractionService {
  // Common tag patterns
  private readonly tagPatterns = [
    // Emotions/moods
    /\b(happy|sad|angry|excited|nervous|anxious|calm|peaceful|stressed|relaxed|tired|energetic|frustrated|grateful|thankful|blessed|worried|confident|scared|brave)\b/gi,
    
    // Activities
    /\b(work|working|meeting|project|study|studying|reading|writing|exercise|running|walking|gym|yoga|meditation|travel|traveling|vacation|holiday|party|celebration|dinner|lunch|breakfast|coffee|shopping|hiking|swimming|cooking|baking|cleaning|gardening)\b/gi,
    
    // Locations
    /\b(home|office|school|university|college|restaurant|cafe|park|beach|mountains|city|town|countryside|airport|hotel|hospital|store|shop|mall|gym|library|museum|theater|cinema|stadium)\b/gi,
    
    // People/relationships
    /\b(family|friend|friends|colleague|boss|manager|teammate|partner|spouse|parent|child|sibling|brother|sister|mom|dad|mother|father|grandma|grandpa|aunt|uncle|cousin)\b/gi,
    
    // Time references
    /\b(morning|afternoon|evening|night|midnight|dawn|dusk|weekend|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday|tomorrow|this week|next week|last week|this month|next month|last month)\b/gi,
    
    // Health/wellness
    /\b(health|fitness|workout|diet|nutrition|sleep|rest|recovery|illness|sick|doctor|appointment|medication|therapy|mental health|wellness|self-care)\b/gi,
    
    // Work/career
    /\b(career|job|interview|promotion|raise|salary|deadline|meeting|presentation|client|customer|project|team|colleague|boss|manager|workplace|office|remote|hybrid)\b/gi,
    
    // Hobbies/interests
    /\b(hobby|music|movie|film|book|reading|writing|art|drawing|painting|photography|gaming|video games|sports|football|basketball|soccer|tennis|golf|fishing|hunting|camping|outdoors|indoor|craft|diy|gardening|cooking|baking)\b/gi,
    
    // Events
    /\b(birthday|wedding|anniversary|graduation|funeral|ceremony|event|conference|seminar|workshop|class|lesson|course|training|convention|festival|concert|show|performance|exhibition)\b/gi,
    
    // Technology
    /\b(computer|laptop|phone|smartphone|tablet|app|software|website|internet|online|offline|tech|technology|digital|ai|artificial intelligence|programming|coding|development|design)\b/gi,
  ];

  // Tag categories for better organization
  private readonly tagCategories: Record<string, string[]> = {
    emotion: ['happy', 'sad', 'angry', 'excited', 'nervous', 'anxious', 'calm', 'peaceful', 'stressed', 'relaxed', 'tired', 'energetic', 'frustrated', 'grateful', 'thankful', 'blessed', 'worried', 'confident', 'scared', 'brave'],
    activity: ['work', 'meeting', 'project', 'study', 'reading', 'writing', 'exercise', 'running', 'walking', 'gym', 'yoga', 'meditation', 'travel', 'vacation', 'party', 'celebration', 'dinner', 'coffee', 'shopping', 'hiking', 'swimming', 'cooking', 'baking', 'cleaning', 'gardening'],
    location: ['home', 'office', 'school', 'university', 'restaurant', 'cafe', 'park', 'beach', 'mountains', 'city', 'airport', 'hotel', 'hospital', 'store', 'mall', 'gym', 'library', 'museum'],
    relationship: ['family', 'friend', 'colleague', 'boss', 'manager', 'teammate', 'partner', 'spouse', 'parent', 'child', 'sibling', 'brother', 'sister'],
    time: ['morning', 'afternoon', 'evening', 'night', 'weekend', 'weekday', 'today', 'yesterday', 'tomorrow'],
    health: ['health', 'fitness', 'workout', 'diet', 'sleep', 'rest', 'illness', 'doctor', 'therapy', 'wellness'],
    work: ['career', 'job', 'interview', 'promotion', 'deadline', 'meeting', 'presentation', 'client', 'project', 'team'],
    hobby: ['music', 'movie', 'book', 'art', 'gaming', 'sports', 'photography', 'craft', 'gardening', 'cooking'],
    event: ['birthday', 'wedding', 'anniversary', 'graduation', 'ceremony', 'conference', 'concert', 'show'],
    tech: ['computer', 'phone', 'app', 'software', 'internet', 'tech', 'digital', 'ai', 'programming']
  };

  /**
   * Extract tags using rule-based patterns - NO API CALLS
   */
  async suggestTags(content: string, userId?: string): Promise<string[]> {
    const tags = new Set<string>();
    const lowerContent = content.toLowerCase();

    // Extract tags from patterns
    for (const pattern of this.tagPatterns) {
      const matches = lowerContent.matchAll(pattern);
      for (const match of matches) {
        const tag = match[0].toLowerCase().trim();
        if (tag.length > 2 && tag.length < 30) {
          tags.add(tag);
        }
      }
    }

    // Get existing tags from user's entries (if userId provided)
    if (userId) {
      try {
        const existingTags = await memoryService.listTags(userId);
        // Check if content mentions existing tags
        for (const existingTag of existingTags) {
          if (lowerContent.includes(existingTag.toLowerCase())) {
            tags.add(existingTag.toLowerCase());
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to get existing tags');
      }
    }

    // Extract capitalized words (likely proper nouns - names, places)
    const capitalizedWords = content.match(/\b[A-Z][a-z]+\b/g);
    if (capitalizedWords) {
      for (const word of capitalizedWords) {
        const lowerWord = word.toLowerCase();
        // Only add if it's not a common word and is longer than 3 chars
        if (lowerWord.length > 3 && !this.isCommonWord(lowerWord)) {
          tags.add(lowerWord);
        }
      }
    }

    // Extract hashtag-like patterns
    const hashtags = content.match(/#(\w+)/g);
    if (hashtags) {
      for (const hashtag of hashtags) {
        const tag = hashtag.slice(1).toLowerCase();
        if (tag.length > 1) {
          tags.add(tag);
        }
      }
    }

    // Limit to top 10 tags (most relevant)
    const tagArray = Array.from(tags);
    
    // Score tags by frequency and relevance
    const tagScores = new Map<string, number>();
    for (const tag of tagArray) {
      const regex = new RegExp(`\\b${tag}\\b`, 'gi');
      const matches = content.match(regex);
      const frequency = matches ? matches.length : 0;
      
      // Boost score for certain categories
      let categoryBoost = 1;
      for (const [category, categoryTags] of Object.entries(this.tagCategories)) {
        if (categoryTags.includes(tag)) {
          categoryBoost = 1.5;
          break;
        }
      }
      
      tagScores.set(tag, frequency * categoryBoost);
    }

    // Sort by score and return top 10
    return tagArray
      .sort((a, b) => (tagScores.get(b) || 0) - (tagScores.get(a) || 0))
      .slice(0, 10);
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
      'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'let', 'put', 'say', 'she', 'too', 'use', 'this', 'that', 'with',
      'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make',
      'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'what', 'when', 'will', 'your', 'about', 'after', 'again', 'before', 'being',
      'below', 'between', 'during', 'first', 'found', 'great', 'group', 'house', 'large', 'learn', 'never', 'other', 'place', 'plant', 'point', 'right',
      'small', 'sound', 'spell', 'still', 'study', 'their', 'there', 'these', 'thing', 'think', 'three', 'water', 'where', 'which', 'world', 'would', 'write'
    ];
    return commonWords.includes(word.toLowerCase());
  }
}

export const ruleBasedTagExtractionService = new RuleBasedTagExtractionService();

