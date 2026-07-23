/**
 * Spatial reasoner — thin facade over cognition for call sites that want a
 * single "is this a place?" answer before generating suggestions.
 */

import { placeCognitionEngine } from './placeCognitionEngine';
import type { PlaceCognitionInput, PlaceCognitionResult } from './placeTypes';

export function reasonAboutPlace(input: PlaceCognitionInput): PlaceCognitionResult {
  return placeCognitionEngine.evaluate(input);
}

export function shouldSurfacePlaceSuggestion(result: PlaceCognitionResult): boolean {
  return result.decision === 'ACCEPT'
    || result.decision === 'MERGE_EXISTING'
    || result.decision === 'REVIEW'
    || result.decision === 'HOLD_GENERIC';
}
