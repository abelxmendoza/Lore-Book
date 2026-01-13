// =====================================================
// BIOMETRIC EXTRACTOR
// Purpose: Extract biometric data from conversations (scale data, health metrics)
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface BiometricMeasurement {
  user_id: string;
  measurement_date: string;
  source: 'smart_scale' | 'manual' | 'fitness_tracker' | 'other';
  weight?: number; // in lbs or kg
  body_fat_percentage?: number;
  muscle_mass?: number;
  bmi?: number;
  hydration_percentage?: number;
  bone_mass?: number;
  visceral_fat?: number;
  metabolic_age?: number;
  measurements?: Record<string, number>; // For additional metrics
  source_entry_id?: string;
  metadata?: Record<string, unknown>;
}

export class BiometricExtractor {
  /**
   * Detect if text contains biometric data
   */
  detectBiometrics(content: string): boolean {
    const lowerContent = content.toLowerCase();
    
    const biometricKeywords = [
      'scale', 'weighed', 'weight', 'body fat', 'bodyfat', 'muscle mass',
      'bmi', 'hydration', 'bone mass', 'visceral fat', 'metabolic age',
      'body composition', 'biometric', 'health metrics', 'fitness tracker'
    ];
    
    return biometricKeywords.some(keyword => lowerContent.includes(keyword));
  }

  /**
   * Extract biometric data from text using LLM
   */
  async extractBiometrics(
    userId: string,
    content: string,
    entryId?: string
  ): Promise<BiometricMeasurement | null> {
    try {
      const { openai } = await import('../openaiClient');
      
      const prompt = `Extract biometric/health measurement data from the following text. Return JSON only, no markdown.

Text: "${content}"

Extract any mentioned measurements:
- weight (in lbs or kg)
- body fat percentage
- muscle mass
- BMI
- hydration percentage
- bone mass
- visceral fat
- metabolic age
- any other health metrics

Determine the source:
- "smart_scale" if mentioned scale or smart scale
- "fitness_tracker" if mentioned fitness tracker, watch, or wearable
- "manual" if user manually entered
- "other" otherwise

Return JSON in this format:
{
  "source": "smart_scale" | "fitness_tracker" | "manual" | "other",
  "weight": number or null,
  "body_fat_percentage": number or null,
  "muscle_mass": number or null,
  "bmi": number or null,
  "hydration_percentage": number or null,
  "bone_mass": number or null,
  "visceral_fat": number or null,
  "metabolic_age": number or null,
  "measurements": {
    "additional_metric_name": number
  }
}

If no biometric data found, return null.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a health data extraction assistant. Extract biometric measurements from text and return only valid JSON.'
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
      
      if (!extracted || extracted === null || 
          (!extracted.weight && !extracted.body_fat_percentage && 
           !extracted.muscle_mass && !extracted.bmi && 
           !extracted.hydration_percentage && Object.keys(extracted.measurements || {}).length === 0)) {
        return null;
      }

      return {
        user_id: userId,
        measurement_date: new Date().toISOString(),
        source: extracted.source || 'other',
        weight: extracted.weight || undefined,
        body_fat_percentage: extracted.body_fat_percentage || undefined,
        muscle_mass: extracted.muscle_mass || undefined,
        bmi: extracted.bmi || undefined,
        hydration_percentage: extracted.hydration_percentage || undefined,
        bone_mass: extracted.bone_mass || undefined,
        visceral_fat: extracted.visceral_fat || undefined,
        metabolic_age: extracted.metabolic_age || undefined,
        measurements: extracted.measurements || undefined,
        source_entry_id: entryId,
        metadata: {
          extracted_at: new Date().toISOString(),
          source_text: content.substring(0, 500) // Store first 500 chars for reference
        }
      };
    } catch (error) {
      logger.error({ error, userId, content }, 'Failed to extract biometrics');
      return null;
    }
  }

  /**
   * Save biometric measurement to database
   */
  async saveBiometricMeasurement(measurement: BiometricMeasurement): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .from('biometric_measurements')
        .insert({
          user_id: measurement.user_id,
          measurement_date: measurement.measurement_date,
          source: measurement.source,
          weight: measurement.weight,
          body_fat_percentage: measurement.body_fat_percentage,
          muscle_mass: measurement.muscle_mass,
          bmi: measurement.bmi,
          hydration_percentage: measurement.hydration_percentage,
          bone_mass: measurement.bone_mass,
          visceral_fat: measurement.visceral_fat,
          metabolic_age: measurement.metabolic_age,
          measurements: measurement.measurements || {},
          source_entry_id: measurement.source_entry_id,
          metadata: measurement.metadata || {}
        })
        .select('id')
        .single();

      if (error) {
        logger.error({ error, measurement }, 'Failed to save biometric measurement');
        throw error;
      }

      return data.id;
    } catch (error) {
      logger.error({ error, measurement }, 'Error saving biometric measurement');
      throw error;
    }
  }

  /**
   * Get biometric measurements for a user with trends
   */
  async getBiometricTrends(
    userId: string,
    metric: 'weight' | 'body_fat_percentage' | 'muscle_mass' | 'bmi' | 'hydration_percentage',
    days: number = 90
  ): Promise<Array<{ date: string; value: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const { data, error } = await supabaseAdmin
        .from('biometric_measurements')
        .select('measurement_date, ' + metric)
        .eq('user_id', userId)
        .gte('measurement_date', cutoffDate.toISOString())
        .not(metric, 'is', null)
        .order('measurement_date', { ascending: true });

      if (error) {
        logger.error({ error, userId, metric }, 'Failed to get biometric trends');
        throw error;
      }

      return (data || [])
        .filter(row => row[metric] !== null && row[metric] !== undefined)
        .map(row => ({
          date: row.measurement_date,
          value: row[metric] as number
        }));
    } catch (error) {
      logger.error({ error, userId, metric }, 'Error getting biometric trends');
      throw error;
    }
  }
}

export const biometricExtractor = new BiometricExtractor();
