// =====================================================
// WORKOUT EVENT DETECTOR
// Purpose: Detect and extract workout data from conversations
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnit } from '../../types/conversationCentered';
import { supabaseAdmin } from '../supabaseClient';

export interface WorkoutStats {
  exercises: Array<{
    name: string;
    sets?: number;
    reps?: number;
    weight?: number; // in lbs/kg
    duration?: number; // in minutes
    notes?: string;
  }>;
  totalDuration?: number; // in minutes
  caloriesBurned?: number;
  heartRate?: {
    avg?: number;
    max?: number;
  };
  workoutNotes?: string;
}

export interface WorkoutEvent {
  event_id?: string;
  user_id: string;
  workout_type: 'weightlifting' | 'cardio' | 'mixed' | 'other';
  location?: string; // gym name/location
  date: string;
  stats: WorkoutStats;
  photos?: string[]; // photo URLs or IDs
  significance_score: number; // 0-1
  social_interactions?: Array<{
    person_name: string;
    interaction_type: 'met_new' | 'saw_familiar' | 'conversation' | 'romantic_interest';
    relationship_impact?: 'new_talking_stage' | 'situationship' | 'friendship_update';
    notes?: string;
  }>;
  skills_practiced?: string[]; // e.g., ['weightlifting', 'social_skills']
  metadata: Record<string, unknown>;
}

export class WorkoutEventDetector {
  /**
   * Detect if a unit contains workout information
   */
  async detectWorkout(unit: ExtractedUnit): Promise<boolean> {
    const content = (unit.content || '').toLowerCase();
    
    // Workout keywords
    const workoutKeywords = [
      'worked out', 'workout', 'gym', 'lifted', 'lifting', 'weightlifting',
      'bench press', 'squat', 'deadlift', 'cardio', 'ran', 'running',
      'exercised', 'training', 'fitness', 'exercise', 'reps', 'sets',
      'personal record', 'pr', 'max', 'one rep max', '1rm'
    ];
    
    return workoutKeywords.some(keyword => content.includes(keyword));
  }

  /**
   * Extract workout data from text using LLM
   */
  async extractWorkoutData(
    userId: string,
    content: string,
    photos?: Array<{ id: string; url?: string }>
  ): Promise<Partial<WorkoutEvent> | null> {
    try {
      // Use LLM to extract structured workout data
      const { openai } = await import('../openaiClient');
      
      const prompt = `Extract workout information from the following text. Return JSON only, no markdown.

Text: "${content}"

Extract:
1. Workout type: weightlifting, cardio, mixed, or other
2. Location/gym name if mentioned
3. Exercises with sets, reps, weight (if mentioned)
4. Total duration if mentioned
5. Calories burned if mentioned
6. Heart rate if mentioned
7. Any workout notes

Return JSON in this format:
{
  "workout_type": "weightlifting" | "cardio" | "mixed" | "other",
  "location": "gym name or null",
  "exercises": [
    {
      "name": "exercise name",
      "sets": number or null,
      "reps": number or null,
      "weight": number or null,
      "duration": number or null,
      "notes": "string or null"
    }
  ],
  "totalDuration": number or null,
  "caloriesBurned": number or null,
  "heartRate": {
    "avg": number or null,
    "max": number or null
  },
  "workoutNotes": "string or null"
}

If no workout data found, return null.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a fitness data extraction assistant. Extract workout information from text and return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const extracted = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!extracted || extracted === null || Object.keys(extracted).length === 0) {
        return null;
      }

      // Build workout stats
      const stats: WorkoutStats = {
        exercises: extracted.exercises || [],
        totalDuration: extracted.totalDuration || undefined,
        caloriesBurned: extracted.caloriesBurned || undefined,
        heartRate: extracted.heartRate || undefined,
        workoutNotes: extracted.workoutNotes || undefined
      };

      return {
        workout_type: extracted.workout_type || 'other',
        location: extracted.location || undefined,
        stats,
        photos: photos?.map(p => p.id),
        significance_score: 0.5, // Base score, will be calculated later
        metadata: {
          extracted_at: new Date().toISOString(),
          source: 'text_extraction'
        }
      };
    } catch (error) {
      logger.error({ error, userId, content }, 'Failed to extract workout data');
      return null;
    }
  }

  /**
   * Calculate significance score for a workout
   */
  calculateSignificance(workout: Partial<WorkoutEvent>): number {
    let score = 0.3; // Base score for any workout
    
    // Social interactions boost significance
    if (workout.social_interactions && workout.social_interactions.length > 0) {
      score += 0.3;
      if (workout.social_interactions.some(i => i.interaction_type === 'met_new')) {
        score += 0.2; // Meeting someone new is significant
      }
      if (workout.social_interactions.some(i => 
        i.relationship_impact === 'new_talking_stage' || 
        i.relationship_impact === 'situationship'
      )) {
        score += 0.2; // Starting a talking stage is very significant
      }
    }
    
    // Check for personal records (would need to compare with history)
    // For now, detect keywords
    const notes = workout.stats?.workoutNotes?.toLowerCase() || '';
    const exerciseNotes = workout.stats?.exercises?.map(e => e.notes?.toLowerCase() || '').join(' ') || '';
    const allText = (notes + ' ' + exerciseNotes).toLowerCase();
    
    if (allText.includes('pr') || allText.includes('personal record') || 
        allText.includes('max') || allText.includes('best')) {
      score += 0.2;
    }
    
    // Photos boost significance (shows effort to document)
    if (workout.photos && workout.photos.length > 0) {
      score += 0.1;
    }
    
    // Detailed stats boost significance
    if (workout.stats?.exercises && workout.stats.exercises.length > 3) {
      score += 0.1;
    }
    
    // Multiple exercises show comprehensive workout
    if (workout.stats?.exercises && workout.stats.exercises.length > 5) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Save workout event to database
   */
  async saveWorkoutEvent(
    userId: string,
    eventId: string,
    workout: Partial<WorkoutEvent>
  ): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .from('workout_events')
        .insert({
          user_id: userId,
          event_id: eventId,
          workout_type: workout.workout_type || 'other',
          location_id: null, // Would need to resolve location name to ID
          stats: workout.stats || {},
          photo_ids: workout.photos || [],
          significance_score: workout.significance_score || 0.5,
          social_interactions: workout.social_interactions || [],
          skills_practiced: workout.skills_practiced || [],
          metadata: workout.metadata || {}
        })
        .select('id')
        .single();

      if (error) {
        logger.error({ error, userId, eventId }, 'Failed to save workout event');
        throw error;
      }

      return data.id;
    } catch (error) {
      logger.error({ error, userId, eventId }, 'Error saving workout event');
      throw error;
    }
  }

  /**
   * Get workout events for a user
   */
  async getWorkoutEvents(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<WorkoutEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('workout_events')
        .select(`
          *,
          resolved_events(start_time, title, summary)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error({ error, userId }, 'Failed to get workout events');
        throw error;
      }

      return (data || []).map((row: any) => ({
        event_id: row.event_id,
        user_id: row.user_id,
        workout_type: row.workout_type,
        location: undefined, // Would need to join with locations
        date: (row.resolved_events as any)?.start_time || row.created_at,
        stats: row.stats as WorkoutStats,
        photos: row.photo_ids || [],
        significance_score: row.significance_score,
        social_interactions: row.social_interactions as WorkoutEvent['social_interactions'],
        skills_practiced: row.skills_practiced || [],
        metadata: row.metadata || {}
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Error getting workout events');
      throw error;
    }
  }
}

export const workoutEventDetector = new WorkoutEventDetector();
