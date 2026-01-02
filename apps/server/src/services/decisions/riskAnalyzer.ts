import { logger } from '../../logger';
import type { Decision, DecisionInsight } from './types';

/**
 * Analyzes risk level of decisions
 */
export class RiskAnalyzer {
  /**
   * Analyze risk for decisions
   */
  analyze(decisions: Decision[]): DecisionInsight[] {
    const insights: DecisionInsight[] = [];

    try {
      for (const decision of decisions) {
        const riskLevel = this.calculateRiskLevel(decision);
        decision.risk_level = riskLevel;

        // Generate warning if risk is high
        if (riskLevel >= 0.7) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'risk_warning',
            message: this.generateRiskMessage(decision, riskLevel),
            confidence: 0.9,
            timestamp: decision.timestamp,
            decision_id: decision.id || '',
            metadata: {
              risk_level: riskLevel,
              risk_factors: this.getRiskFactors(decision),
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to analyze decision risk');
    }

    return insights;
  }

  /**
   * Calculate risk level for a decision
   */
  private calculateRiskLevel(decision: Decision): number {
    let risk = 0.5; // Base risk

    // Factor 1: Historical outcome
    if (decision.outcome === 'negative') {
      risk += 0.3;
    } else if (decision.outcome === 'positive') {
      risk -= 0.2;
    }

    // Factor 2: Category-based risk
    const categoryRisk = this.getCategoryRisk(decision.category);
    risk += categoryRisk;

    // Factor 3: Similar decisions with negative outcomes
    if (decision.similarity_matches && decision.similarity_matches.length > 0) {
      // If there are many similar decisions, it might be a pattern
      risk += 0.1;
    }

    // Factor 4: Decision description keywords
    const descLower = decision.description.toLowerCase();
    const highRiskKeywords = ['risk', 'dangerous', 'risky', 'uncertain', 'gamble', 'bet', 'all-in'];
    const lowRiskKeywords = ['safe', 'sure', 'certain', 'guaranteed', 'secure'];

    if (highRiskKeywords.some(kw => descLower.includes(kw))) {
      risk += 0.2;
    }
    if (lowRiskKeywords.some(kw => descLower.includes(kw))) {
      risk -= 0.15;
    }

    // Factor 5: Alternatives considered (more alternatives = more thought = lower risk)
    if (decision.alternatives_considered && decision.alternatives_considered.length >= 3) {
      risk -= 0.1;
    } else if (!decision.alternatives_considered || decision.alternatives_considered.length === 0) {
      risk += 0.1; // No alternatives considered = higher risk
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, risk));
  }

  /**
   * Get category-based risk
   */
  private getCategoryRisk(category?: string): number {
    if (!category) return 0;

    const categoryRisks: Record<string, number> = {
      financial: 0.2, // Financial decisions are often higher risk
      relationship: 0.15, // Relationship decisions can have long-term impact
      career: 0.15, // Career decisions are significant
      location: 0.1, // Moving/relocating is a big change
      health: 0.1, // Health decisions are important
      family: 0.1, // Family decisions matter
      education: 0.05, // Education decisions are usually lower risk
      social: 0.0, // Social decisions are usually low risk
      other: 0.0,
    };

    return categoryRisks[category] || 0;
  }

  /**
   * Get risk factors for a decision
   */
  private getRiskFactors(decision: Decision): string[] {
    const factors: string[] = [];

    if (decision.outcome === 'negative') {
      factors.push('Previous negative outcome');
    }

    const category = decision.category;
    if (category === 'financial' || category === 'career' || category === 'relationship') {
      factors.push(`High-impact category: ${category}`);
    }

    if (!decision.alternatives_considered || decision.alternatives_considered.length === 0) {
      factors.push('No alternatives considered');
    }

    const descLower = decision.description.toLowerCase();
    if (descLower.includes('risk') || descLower.includes('uncertain')) {
      factors.push('Decision mentions risk/uncertainty');
    }

    return factors;
  }

  /**
   * Generate risk warning message
   */
  private generateRiskMessage(decision: Decision, riskLevel: number): string {
    const severity = riskLevel >= 0.9 ? 'critical' : riskLevel >= 0.8 ? 'high' : 'medium';
    const desc = decision.description.substring(0, 60);

    if (severity === 'critical') {
      return `⚠️ Critical Risk: Decision "${desc}..." has very high risk factors. Consider carefully.`;
    }
    if (severity === 'high') {
      return `High-risk decision: "${desc}..." previously led to negative results or has significant risk factors.`;
    }
    return `Medium-risk decision: "${desc}..." has some risk factors to consider.`;
  }
}

