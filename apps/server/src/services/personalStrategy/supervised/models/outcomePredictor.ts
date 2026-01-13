import { logger } from '../../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import { MultiClassLogisticRegression } from './simpleModel';
import { ActionOutcomeDataset } from '../datasets/actionOutcomeDataset';
import type { ActionOutcome, OutcomePrediction, ModelMetadata } from '../types';
import type { RLStateVector } from '../../types';

/**
 * Outcome Predictor Model
 * Predicts action outcomes before they happen
 */
export class OutcomePredictor {
  private model: MultiClassLogisticRegression | null = null;
  private dataset: ActionOutcomeDataset;
  private numFeatures: number = 15; // Based on ActionOutcomeDataset
  private outcomes: ActionOutcome[] = ['positive', 'neutral', 'negative'];

  constructor() {
    this.dataset = new ActionOutcomeDataset();
  }

  /**
   * Train model on user's data
   */
  async train(userId: string): Promise<{ accuracy: number; metadata: ModelMetadata }> {
    try {
      logger.info({ userId }, 'Training outcome predictor');

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
        this.outcomes,
        this.numFeatures,
        0.01
      );

      // Prepare training data
      const trainingData = examples.map(ex => ({
        features: ex.state_features,
        label: ex.outcome,
      }));

      // Train
      this.model.trainBatch(trainingData, 20);

      // Evaluate
      const accuracy = this.evaluate(examples);

      // Save model
      const metadata = await this.saveModel(userId, accuracy);

      logger.info({ userId, accuracy, examples: examples.length }, 'Trained outcome predictor');

      return { accuracy, metadata };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to train outcome predictor');
      throw error;
    }
  }

  /**
   * Predict outcome for state-action pair
   */
  async predict(
    userId: string,
    state: RLStateVector,
    actionType: string
  ): Promise<OutcomePrediction> {
    try {
      // Load model if not loaded
      if (!this.model) {
        await this.loadModel(userId);
      }

      if (!this.model) {
        // Fallback: return neutral
        return {
          outcome: 'neutral',
          confidence: 0.5,
          probabilities: {
            positive: 0.33,
            neutral: 0.34,
            negative: 0.33,
          },
        };
      }

      // Extract features
      const features = this.dataset['stateToFeatures'](state, actionType);

      // Predict
      const probabilities = this.model.predict(features);
      const prediction = this.model.predictClass(features);

      return {
        outcome: prediction.class as ActionOutcome,
        confidence: prediction.confidence,
        probabilities: probabilities as Record<ActionOutcome, number>,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to predict outcome');
      return {
        outcome: 'neutral',
        confidence: 0.5,
        probabilities: {
          positive: 0.33,
          neutral: 0.34,
          negative: 0.33,
        },
      };
    }
  }

  /**
   * Evaluate model accuracy
   */
  private evaluate(examples: Array<{ state_features: number[]; outcome: ActionOutcome }>): number {
    if (!this.model || examples.length === 0) return 0;

    let correct = 0;
    for (const example of examples) {
      const prediction = this.model.predictClass(example.state_features);
      if (prediction.class === example.outcome) {
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
      model_id: `outcome_predictor_${userId}`,
      model_type: 'outcome_predictor',
      user_id: userId,
      version: 1,
      accuracy,
      trained_at: new Date().toISOString(),
      feature_names: Array.from({ length: this.numFeatures }, (_, i) => `feature_${i}`),
      hyperparameters: {
        learning_rate: 0.01,
        epochs: 20,
        num_classes: this.outcomes.length,
      },
    };

    await supabaseAdmin
      .from('ml_models')
      .upsert({
        model_id: metadata.model_id,
        user_id: userId,
        model_type: 'outcome_predictor',
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
        .eq('model_type', 'outcome_predictor')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data?.weights) {
        this.model = new MultiClassLogisticRegression(
          this.outcomes,
          this.numFeatures,
          0.01
        );
        this.model.loadWeights(data.weights);
      }
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to load outcome predictor model');
    }
  }

  /**
   * Create metadata
   */
  private createMetadata(userId: string, accuracy: number): ModelMetadata {
    return {
      model_id: `outcome_predictor_${userId}`,
      model_type: 'outcome_predictor',
      user_id: userId,
      version: 1,
      accuracy,
      trained_at: new Date().toISOString(),
      feature_names: Array.from({ length: this.numFeatures }, (_, i) => `feature_${i}`),
      hyperparameters: {},
    };
  }
}
