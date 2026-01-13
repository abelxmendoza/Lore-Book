import { logger } from '../../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import { LinearRegression } from './simpleModel';
import { AlignmentDataset } from '../datasets/alignmentDataset';
import type { AlignmentImpactPrediction, ModelMetadata } from '../types';
import type { RLStateVector } from '../../types';

/**
 * Alignment Regressor Model
 * Predicts identity alignment impact of actions
 */
export class AlignmentRegressor {
  private model: LinearRegression | null = null;
  private dataset: AlignmentDataset;
  private numFeatures: number = 14; // Based on AlignmentDataset

  constructor() {
    this.dataset = new AlignmentDataset();
  }

  /**
   * Train model on user's data
   */
  async train(userId: string): Promise<{ mse: number; metadata: ModelMetadata }> {
    try {
      logger.info({ userId }, 'Training alignment regressor');

      // Load training examples
      const examples = await this.dataset.loadTrainingExamples(userId, 1000);

      if (examples.length < 10) {
        logger.warn({ userId, examples: examples.length }, 'Insufficient training data');
        return {
          mse: 1.0,
          metadata: this.createMetadata(userId, 1.0),
        };
      }

      // Initialize model
      this.model = new LinearRegression(this.numFeatures, 0.01);

      // Prepare training data
      const trainingData = examples.map(ex => ({
        features: ex.state_before,
        label: ex.alignment_delta,
      }));

      // Train
      this.model.trainBatch(trainingData, 20);

      // Evaluate (MSE)
      const mse = this.evaluate(examples);

      // Save model
      const metadata = await this.saveModel(userId, mse);

      logger.info({ userId, mse, examples: examples.length }, 'Trained alignment regressor');

      return { mse, metadata };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to train alignment regressor');
      throw error;
    }
  }

  /**
   * Predict alignment impact
   */
  async predict(
    userId: string,
    state: RLStateVector,
    actionType: string
  ): Promise<AlignmentImpactPrediction> {
    try {
      // Load model if not loaded
      if (!this.model) {
        await this.loadModel(userId);
      }

      if (!this.model) {
        // Fallback: return neutral
        return {
          alignment_delta: 0,
          confidence: 0.5,
        };
      }

      // Extract features
      const features = this.dataset['stateToFeatures'](state, actionType);

      // Predict
      const alignmentDelta = this.model.predict(features);

      // Clamp to [-1, 1]
      const clamped = Math.max(-1, Math.min(1, alignmentDelta));

      // Confidence based on prediction magnitude (simplified)
      const confidence = Math.min(Math.abs(clamped) * 0.5 + 0.5, 1.0);

      return {
        alignment_delta: clamped,
        confidence,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to predict alignment impact');
      return {
        alignment_delta: 0,
        confidence: 0.5,
      };
    }
  }

  /**
   * Evaluate model (MSE)
   */
  private evaluate(examples: Array<{ state_before: number[]; alignment_delta: number }>): number {
    if (!this.model || examples.length === 0) return 1.0;

    let sumSquaredError = 0;
    for (const example of examples) {
      const prediction = this.model.predict(example.state_before);
      const error = prediction - example.alignment_delta;
      sumSquaredError += error * error;
    }

    return sumSquaredError / examples.length;
  }

  /**
   * Save model to database
   */
  private async saveModel(userId: string, mse: number): Promise<ModelMetadata> {
    if (!this.model) {
      throw new Error('Model not trained');
    }

    const weights = this.model.getWeights();
    const metadata: ModelMetadata = {
      model_id: `alignment_regressor_${userId}`,
      model_type: 'alignment_regressor',
      user_id: userId,
      version: 1,
      trained_at: new Date().toISOString(),
      feature_names: Array.from({ length: this.numFeatures }, (_, i) => `feature_${i}`),
      hyperparameters: {
        learning_rate: 0.01,
        epochs: 20,
      },
    };

    await supabaseAdmin
      .from('ml_models')
      .upsert({
        model_id: metadata.model_id,
        user_id: userId,
        model_type: 'alignment_regressor',
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
        .eq('model_type', 'alignment_regressor')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data?.weights) {
        this.model = new LinearRegression(this.numFeatures, 0.01);
        this.model.loadWeights(data.weights);
      }
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to load alignment regressor model');
    }
  }

  /**
   * Create metadata
   */
  private createMetadata(userId: string, mse: number): ModelMetadata {
    return {
      model_id: `alignment_regressor_${userId}`,
      model_type: 'alignment_regressor',
      user_id: userId,
      version: 1,
      trained_at: new Date().toISOString(),
      feature_names: Array.from({ length: this.numFeatures }, (_, i) => `feature_${i}`),
      hyperparameters: {},
    };
  }
}
