import { logger } from '../../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import { MultiClassLogisticRegression } from './simpleModel';
import { EntryDataset } from '../datasets/entryDataset';
import type { PatternType, PatternPrediction, ModelMetadata } from '../types';

/**
 * Pattern Classifier Model
 * Classifies journal entries into life patterns
 */
export class PatternClassifier {
  private model: MultiClassLogisticRegression | null = null;
  private dataset: EntryDataset;
  private numFeatures: number = 15; // Based on EntryDataset feature extraction
  private patternTypes: PatternType[] = [
    'growth',
    'maintenance',
    'recovery',
    'avoidance_spiral',
    'burnout_risk',
    'stagnation',
  ];

  constructor() {
    this.dataset = new EntryDataset();
  }

  /**
   * Train model on user's data
   */
  async train(userId: string): Promise<{ accuracy: number; metadata: ModelMetadata }> {
    try {
      logger.info({ userId }, 'Training pattern classifier');

      // Load training examples
      const examples = await this.dataset.loadTrainingExamples(userId, 1000);

      if (examples.length < 10) {
        logger.warn({ userId, examples: examples.length }, 'Insufficient training data');
        return {
          accuracy: 0,
          metadata: this.createMetadata(userId, 0),
        };
      }

      // Initialize model
      this.model = new MultiClassLogisticRegression(
        this.patternTypes,
        this.numFeatures,
        0.01
      );

      // Prepare training data
      const trainingData = examples.map(ex => ({
        features: ex.features,
        label: ex.pattern!,
      }));

      // Train
      this.model.trainBatch(trainingData, 20);

      // Evaluate (simple: use same data, should use validation set in production)
      const accuracy = this.evaluate(examples);

      // Save model
      const metadata = await this.saveModel(userId, accuracy);

      logger.info({ userId, accuracy, examples: examples.length }, 'Trained pattern classifier');

      return { accuracy, metadata };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to train pattern classifier');
      throw error;
    }
  }

  /**
   * Predict pattern for entry
   */
  async predict(
    userId: string,
    entryText: string,
    stateFeatures?: Record<string, number>
  ): Promise<PatternPrediction> {
    try {
      // Load model if not loaded
      if (!this.model) {
        await this.loadModel(userId);
      }

      if (!this.model) {
        // Fallback: return default
        return {
          pattern: 'maintenance',
          confidence: 0.5,
          probabilities: {
            growth: 0.2,
            maintenance: 0.3,
            recovery: 0.15,
            avoidance_spiral: 0.1,
            burnout_risk: 0.1,
            stagnation: 0.15,
          },
        };
      }

      // Extract features (simplified - would use EntryDataset in production)
      const features = await this.extractFeatures(entryText, stateFeatures);

      // Predict
      const probabilities = this.model.predict(features);
      const prediction = this.model.predictClass(features);

      return {
        pattern: prediction.class as PatternType,
        confidence: prediction.confidence,
        probabilities: probabilities as Record<PatternType, number>,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to predict pattern');
      return {
        pattern: 'maintenance',
        confidence: 0.5,
        probabilities: {
          growth: 0.2,
          maintenance: 0.3,
          recovery: 0.15,
          avoidance_spiral: 0.1,
          burnout_risk: 0.1,
          stagnation: 0.15,
        },
      };
    }
  }

  /**
   * Extract features from entry text
   */
  private async extractFeatures(
    text: string,
    stateFeatures?: Record<string, number>
  ): Promise<number[]> {
    const textLower = text.toLowerCase();
    const features: number[] = [];

    // Text features (same as EntryDataset)
    features.push(Math.min(text.length / 1000, 1.0));
    features.push((text.match(/\./g) || []).length / 10);
    features.push((text.match(/!/g) || []).length / 5);

    const positiveWords = ['good', 'great', 'happy', 'excited', 'proud', 'grateful'];
    const negativeWords = ['bad', 'sad', 'angry', 'frustrated', 'worried', 'anxious'];
    const growthWords = ['learned', 'improved', 'progress', 'better', 'growing'];
    const avoidanceWords = ['avoid', 'procrastinate', 'delay', 'skip', 'ignore'];

    features.push(positiveWords.filter(w => textLower.includes(w)).length / positiveWords.length);
    features.push(negativeWords.filter(w => textLower.includes(w)).length / negativeWords.length);
    features.push(growthWords.filter(w => textLower.includes(w)).length / growthWords.length);
    features.push(avoidanceWords.filter(w => textLower.includes(w)).length / avoidanceWords.length);

    const actionMentions = ['trained', 'coded', 'worked', 'rested', 'socialized', 'learned'];
    features.push(actionMentions.filter(a => textLower.includes(a)).length / actionMentions.length);

    // State features if available
    if (stateFeatures) {
      features.push(stateFeatures.mood || 0);
      features.push(stateFeatures.energy || 0.5);
      features.push(stateFeatures.stress || 0.5);
      features.push(stateFeatures.consistency_score || 0.5);
      features.push(stateFeatures.identity_alignment || 0.5);
    } else {
      // Default state features
      features.push(0, 0.5, 0.5, 0.5, 0.5);
    }

    return features;
  }

  /**
   * Evaluate model accuracy
   */
  private evaluate(examples: Array<{ features: number[]; pattern: PatternType | null }>): number {
    if (!this.model || examples.length === 0) return 0;

    let correct = 0;
    for (const example of examples) {
      if (!example.pattern) continue;

      const prediction = this.model.predictClass(example.features);
      if (prediction.class === example.pattern) {
        correct++;
      }
    }

    return correct / examples.length;
  }

  /**
   * Save model to database
   */
  private async saveModel(userId: string, accuracy: number): Promise<ModelMetadata> {
    if (!this.model) {
      throw new Error('Model not trained');
    }

    const weights = this.model.getWeights();
    const metadata: ModelMetadata = {
      model_id: `pattern_classifier_${userId}`,
      model_type: 'pattern_classifier',
      user_id: userId,
      version: 1,
      accuracy,
      trained_at: new Date().toISOString(),
      feature_names: Array.from({ length: this.numFeatures }, (_, i) => `feature_${i}`),
      hyperparameters: {
        learning_rate: 0.01,
        epochs: 20,
        num_classes: this.patternTypes.length,
      },
    };

    await supabaseAdmin
      .from('ml_models')
      .upsert({
        model_id: metadata.model_id,
        user_id: userId,
        model_type: 'pattern_classifier',
        weights: weights,
        metadata: metadata,
        version: metadata.version,
        updated_at: new Date().toISOString(),
      });

    return metadata;
  }

  /**
   * Load model from database
   */
  private async loadModel(userId: string): Promise<void> {
    try {
      const { data } = await supabaseAdmin
        .from('ml_models')
        .select('weights, metadata')
        .eq('user_id', userId)
        .eq('model_type', 'pattern_classifier')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data?.weights) {
        this.model = new MultiClassLogisticRegression(
          this.patternTypes,
          this.numFeatures,
          0.01
        );
        this.model.loadWeights(data.weights);
      }
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to load pattern classifier model');
    }
  }

  /**
   * Create metadata
   */
  private createMetadata(userId: string, accuracy: number): ModelMetadata {
    return {
      model_id: `pattern_classifier_${userId}`,
      model_type: 'pattern_classifier',
      user_id: userId,
      version: 1,
      accuracy,
      trained_at: new Date().toISOString(),
      feature_names: Array.from({ length: this.numFeatures }, (_, i) => `feature_${i}`),
      hyperparameters: {},
    };
  }
}
