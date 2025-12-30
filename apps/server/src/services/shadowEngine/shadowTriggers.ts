import type { ShadowTriggers } from './shadowTypes';

export const detectShadowTriggers = (entryText: string): ShadowTriggers => {
  const lowerText = entryText.toLowerCase();
  return {
    conflict_trigger: lowerText.includes('argu') || lowerText.includes('fight'),
    rejection_trigger: lowerText.includes('ignored') || lowerText.includes('rejected'),
    humiliation_trigger: lowerText.includes('embarrass'),
    power_trigger: lowerText.includes('respect') || lowerText.includes('dominance'),
  };
};

