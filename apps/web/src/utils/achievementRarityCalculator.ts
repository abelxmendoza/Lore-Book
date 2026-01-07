/**
 * Achievement Rarity Calculator
 * Automatically determines rarity for real-life achievements based on:
 * - Real life impact (how it changes the person's life)
 * - Data quality (evidence completeness and reliability)
 * - General consensus (societal value perception)
 * - Real life difficulty (objective difficulty to achieve)
 * - Research-backed significance (what studies say about importance)
 * - Overall impact (combined effect on life trajectory)
 */

import type { RealLifeAchievement, AchievementRarity } from '../types/achievement';

interface RarityCalculationFactors {
  significanceScore: number; // 0.0 - 1.0 (user-provided)
  xpReward: number;
  verified: boolean;
  lifeCategory: string;
  impactDescription?: string;
  evidenceQuality: number; // 0.0 - 1.0 (based on evidence completeness)
  realLifeImpact: number; // 0.0 - 1.0 (calculated from impact description and category)
  dataQuality: number; // 0.0 - 1.0 (evidence completeness and verification)
  generalConsensus: number; // 0.0 - 1.0 (societal value perception)
  realLifeDifficulty: number; // 0.0 - 1.0 (objective difficulty)
  researchSignificance: number; // 0.0 - 1.0 (research-backed importance)
}

/**
 * Calculate evidence quality score
 * Higher score for more complete evidence
 */
function calculateEvidenceQuality(achievement: RealLifeAchievement): number {
  let score = 0;
  const evidence = achievement.evidence || {};

  // Quotes provide strong evidence (0.3 points)
  if (evidence.quotes && evidence.quotes.length > 0) {
    score += Math.min(0.3, evidence.quotes.length * 0.1);
  }

  // Linked memories provide context (0.2 points)
  if (evidence.linked_memories && evidence.linked_memories.length > 0) {
    score += Math.min(0.2, evidence.linked_memories.length * 0.05);
  }

  // Linked characters show social impact (0.2 points)
  if (evidence.linked_characters && evidence.linked_characters.length > 0) {
    score += Math.min(0.2, evidence.linked_characters.length * 0.05);
  }

  // Linked locations provide context (0.15 points)
  if (evidence.linked_locations && evidence.linked_locations.length > 0) {
    score += Math.min(0.15, evidence.linked_locations.length * 0.05);
  }

  // Photos provide visual proof (0.15 points)
  if (evidence.photos && evidence.photos.length > 0) {
    score += Math.min(0.15, evidence.photos.length * 0.05);
  }

  return Math.min(1.0, score);
}

/**
 * Get general consensus score (societal value perception)
 * Based on research and general consensus about what achievements matter
 */
function getGeneralConsensus(lifeCategory?: string, achievementName?: string): number {
  // Base consensus by category (research-backed societal values)
  const categoryConsensus: Record<string, number> = {
    'health': 0.95,           // Health is universally valued (Maslow's hierarchy)
    'education': 0.90,        // Education highly valued across cultures
    'financial': 0.85,        // Financial security is important
    'career': 0.80,           // Career success is valued
    'relationships': 0.75,    // Relationships matter but vary by culture
    'personal_growth': 0.70,  // Personal growth valued but subjective
    'creative': 0.65,         // Creative achievements vary in value
    'travel': 0.55,          // Travel is nice but less essential
    'hobby': 0.50,           // Hobbies are personal preference
    'other': 0.60            // Default
  };

  let consensus = categoryConsensus[lifeCategory || 'other'] || 0.60;

  // Boost for specific high-consensus achievements
  const highConsensusKeywords = [
    'graduated', 'degree', 'promotion', 'quit smoking', 'marathon', 
    'therapy', 'debt', 'loan', 'meditation', 'exercise', 'diet'
  ];
  
  if (achievementName) {
    const lowerName = achievementName.toLowerCase();
    if (highConsensusKeywords.some(keyword => lowerName.includes(keyword))) {
      consensus = Math.min(1.0, consensus + 0.1);
    }
  }

  return consensus;
}

/**
 * Get real life difficulty score (objective difficulty to achieve)
 * Based on time, effort, skill, and persistence required
 */
function getRealLifeDifficulty(
  lifeCategory?: string, 
  achievementName?: string,
  xpReward?: number,
  significanceScore?: number
): number {
  // Base difficulty by category
  const categoryDifficulty: Record<string, number> = {
    'health': 0.85,          // Health changes are very difficult (habits, addiction)
    'education': 0.80,        // Education requires years of effort
    'financial': 0.75,        // Financial goals require discipline
    'career': 0.70,          // Career advancement takes time and skill
    'relationships': 0.65,   // Relationship work is emotionally difficult
    'personal_growth': 0.70, // Personal growth requires self-awareness
    'creative': 0.60,        // Creative work requires skill development
    'travel': 0.40,         // Travel is easier (mostly financial)
    'hobby': 0.50,          // Hobbies vary in difficulty
    'other': 0.55
  };

  let difficulty = categoryDifficulty[lifeCategory || 'other'] || 0.55;

  // Adjust based on achievement-specific factors
  if (achievementName) {
    const lowerName = achievementName.toLowerCase();
    
    // High difficulty indicators
    if (lowerName.includes('quit') || lowerName.includes('addiction') || 
        lowerName.includes('marathon') || lowerName.includes('degree') ||
        lowerName.includes('therapy') || lowerName.includes('debt')) {
      difficulty = Math.min(1.0, difficulty + 0.15);
    }
    
    // Medium difficulty indicators
    if (lowerName.includes('learned') || lowerName.includes('started') ||
        lowerName.includes('published') || lowerName.includes('promotion')) {
      difficulty = Math.min(1.0, difficulty + 0.10);
    }
  }

  // XP reward correlates with difficulty (higher XP = more difficult)
  if (xpReward) {
    const xpDifficulty = Math.min(1.0, xpReward / 1000);
    difficulty = (difficulty + xpDifficulty) / 2;
  }

  // Significance score also indicates difficulty (higher significance often = harder)
  if (significanceScore) {
    difficulty = (difficulty + significanceScore) / 2;
  }

  return difficulty;
}

/**
 * Get research-backed significance score
 * Based on psychological and sociological research about what matters
 */
function getResearchSignificance(
  lifeCategory?: string,
  achievementName?: string,
  significanceScore?: number
): number {
  // Research-backed importance by category
  // Based on: Maslow's hierarchy, positive psychology, life satisfaction research
  const researchImportance: Record<string, number> = {
    'health': 0.95,          // Health is #1 predictor of life satisfaction (research)
    'education': 0.90,        // Education correlates with life outcomes (research)
    'financial': 0.85,        // Financial security reduces stress (research)
    'relationships': 0.80,    // Relationships are key to happiness (Harvard Study)
    'personal_growth': 0.75,  // Growth mindset improves outcomes (Dweck research)
    'career': 0.70,          // Career satisfaction matters but less than relationships
    'creative': 0.65,         // Creativity improves well-being (research)
    'travel': 0.55,          // Travel has benefits but temporary
    'hobby': 0.50,           // Hobbies improve quality of life
    'other': 0.60
  };

  let researchScore = researchImportance[lifeCategory || 'other'] || 0.60;

  // Specific achievements with strong research backing
  if (achievementName) {
    const lowerName = achievementName.toLowerCase();
    
    // Strongly research-backed
    if (lowerName.includes('therapy') || lowerName.includes('meditation') ||
        lowerName.includes('exercise') || lowerName.includes('quit smoking')) {
      researchScore = Math.min(1.0, researchScore + 0.15);
    }
    
    // Moderately research-backed
    if (lowerName.includes('graduated') || lowerName.includes('debt') ||
        lowerName.includes('marathon') || lowerName.includes('relationship')) {
      researchScore = Math.min(1.0, researchScore + 0.10);
    }
  }

  // Blend with user-provided significance (user knows their context)
  if (significanceScore) {
    researchScore = (researchScore * 0.7) + (significanceScore * 0.3);
  }

  return researchScore;
}

/**
 * Calculate real life impact score
 * Based on impact description and how it changes life trajectory
 */
function calculateRealLifeImpact(
  impactDescription?: string,
  lifeCategory?: string,
  significanceScore?: number
): number {
  let impact = significanceScore || 0.5;

  // Analyze impact description for high-impact keywords
  if (impactDescription) {
    const lowerDesc = impactDescription.toLowerCase();
    
    // Transformative impact indicators
    const transformativeKeywords = [
      'freedom', 'overcame', 'changed', 'transformed', 'milestone',
      'breakthrough', 'turning point', 'life-changing', 'major'
    ];
    
    if (transformativeKeywords.some(keyword => lowerDesc.includes(keyword))) {
      impact = Math.min(1.0, impact + 0.2);
    }
    
    // Significant impact indicators
    const significantKeywords = [
      'important', 'significant', 'achieved', 'accomplished', 'proved',
      'opened', 'eliminated', 'healed', 'improved'
    ];
    
    if (significantKeywords.some(keyword => lowerDesc.includes(keyword))) {
      impact = Math.min(1.0, impact + 0.1);
    }
  }

  // Category-based impact multipliers
  const impactMultipliers: Record<string, number> = {
    'health': 1.2,        // Health impacts everything
    'financial': 1.15,    // Financial impacts stress and options
    'education': 1.1,     // Education opens doors
    'career': 1.1,       // Career impacts daily life
    'relationships': 1.0, // Relationships matter but vary
    'personal_growth': 0.95,
    'creative': 0.9,
    'travel': 0.8,
    'hobby': 0.75,
    'other': 0.85
  };

  impact = Math.min(1.0, impact * (impactMultipliers[lifeCategory || 'other'] || 1.0));

  return impact;
}

/**
 * Calculate data quality score
 * Based on evidence completeness, verification, and reliability
 */
function calculateDataQuality(
  evidenceQuality: number,
  verified: boolean,
  evidence?: RealLifeAchievement['evidence']
): number {
  let quality = evidenceQuality;

  // Verification significantly boosts data quality
  if (verified) {
    quality = Math.min(1.0, quality + 0.3);
  }

  // Multiple evidence types increase reliability
  if (evidence) {
    const evidenceTypes = [
      evidence.quotes?.length || 0,
      evidence.linked_memories?.length || 0,
      evidence.linked_characters?.length || 0,
      evidence.linked_locations?.length || 0,
      evidence.photos?.length || 0
    ].filter(count => count > 0).length;

    // More evidence types = higher quality
    quality = Math.min(1.0, quality + (evidenceTypes * 0.1));
  }

  return quality;
}

/**
 * Calculate rarity score (0.0 - 1.0)
 * Higher score = rarer achievement
 * 
 * Uses comprehensive weighting based on:
 * - Real life impact (how it changes life)
 * - Data quality (evidence and verification)
 * - General consensus (societal value)
 * - Real life difficulty (objective difficulty)
 * - Research significance (research-backed importance)
 * - Overall impact (combined effect)
 */
function calculateRarityScore(factors: RarityCalculationFactors): number {
  // Weighted combination of all factors
  // Weights are based on research and real-world importance
  
  let score = 0;

  // Real life impact (25% weight) - How much it changes the person's life
  score += factors.realLifeImpact * 0.25;

  // Research significance (20% weight) - What research says matters
  score += factors.researchSignificance * 0.20;

  // Real life difficulty (18% weight) - Harder achievements are rarer
  score += factors.realLifeDifficulty * 0.18;

  // General consensus (15% weight) - Societal value perception
  score += factors.generalConsensus * 0.15;

  // Data quality (12% weight) - Verified, well-documented achievements
  score += factors.dataQuality * 0.12;

  // User-provided significance (10% weight) - User knows their context
  score += factors.significanceScore * 0.10;

  return Math.min(1.0, score);
}

/**
 * Determine rarity tier based on score
 */
function scoreToRarity(score: number): AchievementRarity {
  if (score >= 0.85) return 'legendary';
  if (score >= 0.70) return 'epic';
  if (score >= 0.50) return 'rare';
  if (score >= 0.30) return 'uncommon';
  return 'common';
}

/**
 * Auto-calculate rarity for a real-life achievement
 * Uses comprehensive real-world factors:
 * - Real life impact (how it changes life)
 * - Data quality (evidence completeness and verification)
 * - General consensus (societal value perception)
 * - Real life difficulty (objective difficulty to achieve)
 * - Research significance (research-backed importance)
 * - Overall impact (combined effect on life trajectory)
 */
export function calculateAchievementRarity(achievement: RealLifeAchievement): AchievementRarity {
  // Calculate evidence quality
  const evidenceQuality = calculateEvidenceQuality(achievement);

  // Calculate comprehensive factors
  const realLifeImpact = calculateRealLifeImpact(
    achievement.impact_description,
    achievement.life_category,
    achievement.significance_score
  );

  const dataQuality = calculateDataQuality(
    evidenceQuality,
    achievement.verified || false,
    achievement.evidence
  );

  const generalConsensus = getGeneralConsensus(
    achievement.life_category,
    achievement.achievement_name
  );

  const realLifeDifficulty = getRealLifeDifficulty(
    achievement.life_category,
    achievement.achievement_name,
    achievement.xp_reward,
    achievement.significance_score
  );

  const researchSignificance = getResearchSignificance(
    achievement.life_category,
    achievement.achievement_name,
    achievement.significance_score
  );

  // Build comprehensive factors
  const factors: RarityCalculationFactors = {
    significanceScore: achievement.significance_score || 0.5,
    xpReward: achievement.xp_reward,
    verified: achievement.verified || false,
    life_category: achievement.life_category || 'other',
    impactDescription: achievement.impact_description,
    evidenceQuality: evidenceQuality,
    realLifeImpact: realLifeImpact,
    dataQuality: dataQuality,
    generalConsensus: generalConsensus,
    realLifeDifficulty: realLifeDifficulty,
    researchSignificance: researchSignificance
  };

  // Calculate rarity score using comprehensive weighting
  const rarityScore = calculateRarityScore(factors);

  // Convert to rarity tier
  return scoreToRarity(rarityScore);
}

/**
 * Get rarity explanation for an achievement
 * Explains why an achievement received its rarity based on comprehensive factors
 */
export function getRarityExplanation(achievement: RealLifeAchievement): string {
  const rarity = calculateAchievementRarity(achievement);
  const evidenceQuality = calculateEvidenceQuality(achievement);
  const realLifeImpact = calculateRealLifeImpact(
    achievement.impact_description,
    achievement.life_category,
    achievement.significance_score
  );
  const dataQuality = calculateDataQuality(
    evidenceQuality,
    achievement.verified || false,
    achievement.evidence
  );
  const generalConsensus = getGeneralConsensus(
    achievement.life_category,
    achievement.achievement_name
  );
  const realLifeDifficulty = getRealLifeDifficulty(
    achievement.life_category,
    achievement.achievement_name,
    achievement.xp_reward,
    achievement.significance_score
  );
  const researchSignificance = getResearchSignificance(
    achievement.life_category,
    achievement.achievement_name,
    achievement.significance_score
  );

  const reasons: string[] = [];

  // Real life impact
  if (realLifeImpact >= 0.85) {
    reasons.push('transformative life impact');
  } else if (realLifeImpact >= 0.70) {
    reasons.push('significant life impact');
  }

  // Research significance
  if (researchSignificance >= 0.85) {
    reasons.push('research-backed importance');
  }

  // Difficulty
  if (realLifeDifficulty >= 0.80) {
    reasons.push('exceptionally difficult to achieve');
  } else if (realLifeDifficulty >= 0.65) {
    reasons.push('high difficulty');
  }

  // General consensus
  if (generalConsensus >= 0.85) {
    reasons.push('universally valued');
  }

  // Data quality
  if (dataQuality >= 0.80) {
    reasons.push('well-documented and verified');
  } else if (achievement.verified) {
    reasons.push('verified');
  }

  // XP reward
  if (achievement.xp_reward >= 750) {
    reasons.push('major milestone');
  }

  const reasonText = reasons.length > 0 
    ? `Rated ${rarity} due to: ${reasons.join(', ')}`
    : `Rated ${rarity} based on comprehensive achievement analysis`;

  return reasonText;
}

