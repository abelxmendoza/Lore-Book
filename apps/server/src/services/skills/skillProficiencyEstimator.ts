/**
 * Evidence-calibrated proficiency — no fake precision from bare mentions.
 */

import type { SkillEvidenceStrength, SkillProficiencyEstimate } from './skillCognitionTypes';
import { EVIDENCE_STRENGTH_WEIGHT } from './skillCognitionTypes';

export function estimateSkillProficiency(input: {
  evidenceStrength: SkillEvidenceStrength;
  practiceCount: number;
  proposedScore?: number;
  evidenceText?: string;
  userOwned: boolean;
}): SkillProficiencyEstimate {
  const reasons: string[] = [];

  if (!input.userOwned) {
    return {
      label: 'UNKNOWN',
      evidenceDepth: 'NONE',
      confidence: 0.1,
      reasons: ['not_user_owned'],
    };
  }

  if (input.evidenceStrength === 'BARE_MENTION' || input.evidenceStrength === 'INDIRECT_INFERENCE') {
    return {
      label: 'UNKNOWN',
      evidenceDepth: 'WEAK',
      confidence: 0.15,
      reasons: ['insufficient_evidence_for_proficiency'],
    };
  }

  if (input.evidenceStrength === 'SELF_REPORT' && input.practiceCount <= 1) {
    reasons.push('single_self_report_broad_range');
    return {
      range: { min: 35, max: 70 },
      label: 'DEVELOPING',
      evidenceDepth: 'WEAK',
      confidence: 0.4,
      reasons,
    };
  }

  let evidenceDepth: SkillProficiencyEstimate['evidenceDepth'] = 'MODERATE';
  let label: SkillProficiencyEstimate['label'] = 'DEVELOPING';
  let confidence = EVIDENCE_STRENGTH_WEIGHT[input.evidenceStrength] * 0.6;
  let score: number | undefined;
  let range: { min: number; max: number } | undefined;

  if (input.evidenceStrength === 'DIRECT_DEMONSTRATION' || input.evidenceStrength === 'PROFESSIONAL_USE') {
    evidenceDepth = input.practiceCount >= 3 ? 'STRONG' : 'MODERATE';
    label = input.practiceCount >= 5 ? 'ADVANCED' : 'COMPETENT';
    range = label === 'ADVANCED' ? { min: 65, max: 85 } : { min: 50, max: 75 };
    confidence = Math.min(0.85, 0.55 + input.practiceCount * 0.05);
    reasons.push('demonstration_based_estimate');
  } else if (input.evidenceStrength === 'REPEATED_PRACTICE') {
    evidenceDepth = 'STRONG';
    label = 'COMPETENT';
    range = { min: 55, max: 80 };
    confidence = 0.7;
    reasons.push('repeated_practice');
  } else if (input.evidenceStrength === 'EDUCATION' || input.evidenceStrength === 'CERTIFICATION') {
    evidenceDepth = 'MODERATE';
    label = 'DEVELOPING';
    range = { min: 40, max: 70 };
    confidence = 0.55;
    reasons.push('education_or_cert');
  }

  // Only attach a single score when evidence is strong AND practice is repeated
  if (evidenceDepth === 'STRONG' || evidenceDepth === 'EXTENSIVE') {
    if (typeof input.proposedScore === 'number' && input.proposedScore >= 1 && input.proposedScore <= 100) {
      // Clamp proposed score into range rather than trusting LLM precision
      const lo = range?.min ?? 40;
      const hi = range?.max ?? 80;
      score = Math.max(lo, Math.min(hi, Math.round(input.proposedScore)));
      reasons.push('proposed_score_clamped_to_range');
    } else if (range) {
      score = Math.round((range.min + range.max) / 2);
      reasons.push('midpoint_of_range');
    }
  } else {
    reasons.push('no_precise_score_without_depth');
  }

  // Explicit low-confidence self report language
  if (/\b(?:some|a\s+bit|basics?|beginner|learning)\b/i.test(input.evidenceText ?? '')) {
    label = 'BEGINNER';
    range = { min: 20, max: 50 };
    score = undefined;
    confidence = Math.min(confidence, 0.45);
    reasons.push('beginner_language');
  }

  return { score, range, label, evidenceDepth, confidence, reasons };
}
