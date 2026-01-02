export type EssenceInsight = {
  text: string;
  confidence: number;
  extractedAt: string;
  sources: string[];
};

export type SkillInsight = {
  skill: string;
  confidence: number;
  evidence: string[];
  extractedAt: string;
};

export type EvolutionEntry = {
  date: string;
  changes: string;
  trigger: string;
};

export type EssenceProfile = {
  hopes: EssenceInsight[];
  dreams: EssenceInsight[];
  fears: EssenceInsight[];
  strengths: EssenceInsight[];
  weaknesses: EssenceInsight[];
  topSkills: SkillInsight[];
  coreValues: EssenceInsight[];
  personalityTraits: EssenceInsight[];
  relationshipPatterns: EssenceInsight[];
  evolution: EvolutionEntry[];
};


