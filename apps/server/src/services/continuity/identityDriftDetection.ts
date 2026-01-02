import { logger } from '../../logger';
import type { MemoryComponent } from '../../types';
import { supabaseAdmin } from '../supabaseClient';

/**
 * Identity Drift Detection Service
 * Detects changes in self-perception or identity over time
 */
class IdentityDriftDetectionService {
  private readonly IDENTITY_SIMILARITY_THRESHOLD = 0.60; // Cosine similarity threshold
  private readonly IDENTITY_KEYWORDS = [
    'i am',
    'i\'m',
    'i feel like',
    'i see myself as',
    'i consider myself',
    'i identify as',
    'i think of myself as',
    'my identity',
    'who i am',
    'i believe i am',
  ];

  /**
   * Detect identity drift
   */
  async detectIdentityDrift(
    recentComponents: MemoryComponent[],
    userId: string
  ): Promise<Array<{
    event_type: 'identity_drift';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const drifts: Array<{
      event_type: 'identity_drift';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    // 1. Extract identity statements
    const recentIdentityStatements = this.extractIdentityStatements(recentComponents);

    if (recentIdentityStatements.length === 0) {
      return drifts;
    }

    // 2. Get historical identity statements (last month)
    const historicalIdentityStatements = await this.getHistoricalIdentityStatements(userId);

    if (historicalIdentityStatements.length === 0) {
      return drifts;
    }

    // 3. Calculate centroids
    const recentCentroid = this.calculateIdentityCentroid(recentIdentityStatements);
    const historicalCentroid = this.calculateIdentityCentroid(historicalIdentityStatements);

    if (!recentCentroid || !historicalCentroid) {
      return drifts;
    }

    // 4. Compare centroids
    const similarity = this.cosineSimilarity(recentCentroid, historicalCentroid);

    if (similarity < this.IDENTITY_SIMILARITY_THRESHOLD) {
      const driftAmount = 1 - similarity;
      const severity = this.calculateSeverity(driftAmount);

      drifts.push({
        event_type: 'identity_drift',
        description: `Identity shift detected: Significant change in self-perception (similarity: ${similarity.toFixed(2)})`,
        source_components: [
          ...recentIdentityStatements.map(s => s.component.id),
          ...historicalIdentityStatements.map(s => s.component.id),
        ],
        severity,
        metadata: {
          similarity,
          drift_amount: driftAmount,
          recent_statements: recentIdentityStatements.length,
          historical_statements: historicalIdentityStatements.length,
          method: 'centroid_comparison',
        },
      });
    }

    // 5. Detect specific identity changes (keyword-based)
    const specificChanges = this.detectSpecificIdentityChanges(
      recentIdentityStatements,
      historicalIdentityStatements
    );

    for (const change of specificChanges) {
      drifts.push({
        event_type: 'identity_drift',
        description: `Identity change: ${change.description}`,
        source_components: [change.recentComponent.id, change.historicalComponent.id],
        severity: change.severity,
        metadata: {
          change_type: change.type,
          recent_statement: change.recentComponent.text.slice(0, 100),
          historical_statement: change.historicalComponent.text.slice(0, 100),
          method: 'keyword_comparison',
        },
      });
    }

    return drifts;
  }

  /**
   * Extract identity statements from components
   */
  private extractIdentityStatements(
    components: MemoryComponent[]
  ): Array<{ component: MemoryComponent; embedding: number[] | null }> {
    const statements: Array<{ component: MemoryComponent; embedding: number[] | null }> = [];

    for (const component of components) {
      const text = component.text.toLowerCase();

      // Check for identity keywords
      for (const keyword of this.IDENTITY_KEYWORDS) {
        if (text.includes(keyword)) {
          statements.push({
            component,
            embedding: component.embedding || null,
          });
          break;
        }
      }
    }

    return statements;
  }

  /**
   * Get historical identity statements
   */
  private async getHistoricalIdentityStatements(
    userId: string
  ): Promise<Array<{ component: MemoryComponent; embedding: number[] | null }>> {
    // Get components from last month
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .gte('date', oneMonthAgo.toISOString())
      .lt('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    if (!entries || entries.length === 0) {
      return [];
    }

    const entryIds = entries.map(e => e.id);

    const { data: components } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .in('journal_entry_id', entryIds)
      .limit(200);

    if (!components) {
      return [];
    }

    return this.extractIdentityStatements(components as MemoryComponent[]);
  }

  /**
   * Calculate identity centroid
   */
  private calculateIdentityCentroid(
    statements: Array<{ component: MemoryComponent; embedding: number[] | null }>
  ): number[] | null {
    const embeddings = statements
      .map(s => s.embedding)
      .filter((e): e is number[] => e !== null);

    if (embeddings.length === 0) return null;

    const dimension = embeddings[0].length;
    const centroid: number[] = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dimension; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Detect specific identity changes
   */
  private detectSpecificIdentityChanges(
    recentStatements: Array<{ component: MemoryComponent; embedding: number[] | null }>,
    historicalStatements: Array<{ component: MemoryComponent; embedding: number[] | null }>
  ): Array<{
    type: string;
    description: string;
    recentComponent: MemoryComponent;
    historicalComponent: MemoryComponent;
    severity: number;
  }> {
    const changes: Array<{
      type: string;
      description: string;
      recentComponent: MemoryComponent;
      historicalComponent: MemoryComponent;
      severity: number;
    }> = [];

    // Identity dimension patterns
    const identityDimensions = [
      {
        keywords: ['confident', 'confident', 'sure', 'certain', 'self-assured'],
        opposite: ['insecure', 'uncertain', 'doubtful', 'unsure'],
        type: 'confidence',
      },
      {
        keywords: ['optimistic', 'hopeful', 'positive', 'upbeat'],
        opposite: ['pessimistic', 'negative', 'cynical', 'down'],
        type: 'outlook',
      },
      {
        keywords: ['independent', 'self-reliant', 'autonomous'],
        opposite: ['dependent', 'reliant', 'needy'],
        type: 'independence',
      },
      {
        keywords: ['creative', 'artistic', 'imaginative'],
        opposite: ['practical', 'logical', 'analytical'],
        type: 'creativity',
      },
    ];

    for (const dimension of identityDimensions) {
      // Find recent statements with dimension keywords
      const recentMatches = recentStatements.filter(s => {
        const text = s.component.text.toLowerCase();
        return dimension.keywords.some(kw => text.includes(kw));
      });

      // Find historical statements with opposite keywords
      const historicalMatches = historicalStatements.filter(s => {
        const text = s.component.text.toLowerCase();
        return dimension.opposite.some(kw => text.includes(kw));
      });

      if (recentMatches.length > 0 && historicalMatches.length > 0) {
        changes.push({
          type: dimension.type,
          description: `Shift in ${dimension.type}: From ${dimension.opposite[0]} to ${dimension.keywords[0]}`,
          recentComponent: recentMatches[0].component,
          historicalComponent: historicalMatches[0].component,
          severity: 7,
        });
      }
    }

    return changes;
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Calculate severity
   */
  private calculateSeverity(driftAmount: number): number {
    return Math.max(1, Math.min(10, Math.round(driftAmount * 10)));
  }
}

export const identityDriftDetectionService = new IdentityDriftDetectionService();

