/**
 * Simple ML Models (Logistic Regression, Linear Regression)
 * Start simple, upgrade to embeddings/transformers later
 */

import { logger } from '../../../../logger';

export interface ModelWeights {
  [featureIndex: string]: number;
  bias: number;
}

/**
 * Simple Logistic Regression for Classification
 */
export class LogisticRegression {
  private weights: ModelWeights = { bias: 0 };
  private learningRate: number = 0.01;
  private numFeatures: number = 0;

  constructor(numFeatures: number, learningRate: number = 0.01) {
    this.numFeatures = numFeatures;
    this.learningRate = learningRate;
    // Initialize weights randomly
    for (let i = 0; i < numFeatures; i++) {
      this.weights[i.toString()] = (Math.random() - 0.5) * 0.1;
    }
  }

  /**
   * Sigmoid activation
   */
  private sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z)))); // Clamp to prevent overflow
  }

  /**
   * Predict probability
   */
  predict(features: number[]): number {
    if (features.length !== this.numFeatures) {
      logger.warn({ expected: this.numFeatures, got: features.length }, 'Feature mismatch');
      return 0.5;
    }

    let z = this.weights.bias;
    for (let i = 0; i < features.length; i++) {
      z += this.weights[i.toString()] * features[i];
    }

    return this.sigmoid(z);
  }

  /**
   * Train on single example
   */
  train(features: number[], label: number): void {
    const prediction = this.predict(features);
    const error = label - prediction;

    // Update bias
    this.weights.bias += this.learningRate * error;

    // Update weights
    for (let i = 0; i < features.length; i++) {
      this.weights[i.toString()] += this.learningRate * error * features[i];
    }
  }

  /**
   * Train on batch
   */
  trainBatch(examples: Array<{ features: number[]; label: number }>, epochs: number = 10): void {
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const example of examples) {
        this.train(example.features, example.label);
      }
    }
  }

  /**
   * Get weights for saving
   */
  getWeights(): ModelWeights {
    return { ...this.weights };
  }

  /**
   * Load weights
   */
  loadWeights(weights: ModelWeights): void {
    this.weights = { ...weights };
  }
}

/**
 * Multi-class Logistic Regression (One-vs-Rest)
 */
export class MultiClassLogisticRegression {
  private classifiers: Map<string, LogisticRegression> = new Map();
  private classes: string[];
  private numFeatures: number;
  private learningRate: number;

  constructor(classes: string[], numFeatures: number, learningRate: number = 0.01) {
    this.classes = classes;
    this.numFeatures = numFeatures;
    this.learningRate = learningRate;

    // Create one classifier per class (one-vs-rest)
    for (const className of classes) {
      this.classifiers.set(className, new LogisticRegression(numFeatures, learningRate));
    }
  }

  /**
   * Predict probabilities for all classes
   */
  predict(features: number[]): Record<string, number> {
    const probabilities: Record<string, number> = {};

    for (const className of this.classes) {
      const classifier = this.classifiers.get(className);
      if (classifier) {
        probabilities[className] = classifier.predict(features);
      }
    }

    // Normalize probabilities (softmax-like, but simpler)
    const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const className of this.classes) {
        probabilities[className] = probabilities[className] / sum;
      }
    }

    return probabilities;
  }

  /**
   * Predict class
   */
  predictClass(features: number[]): { class: string; confidence: number } {
    const probabilities = this.predict(features);
    let maxProb = 0;
    let maxClass = this.classes[0];

    for (const [className, prob] of Object.entries(probabilities)) {
      if (prob > maxProb) {
        maxProb = prob;
        maxClass = className;
      }
    }

    return { class: maxClass, confidence: maxProb };
  }

  /**
   * Train on batch
   */
  trainBatch(
    examples: Array<{ features: number[]; label: string }>,
    epochs: number = 10
  ): void {
    for (const className of this.classes) {
      // Create binary labels for this class (one-vs-rest)
      const binaryExamples = examples.map(ex => ({
        features: ex.features,
        label: ex.label === className ? 1 : 0,
      }));

      const classifier = this.classifiers.get(className);
      if (classifier) {
        classifier.trainBatch(binaryExamples, epochs);
      }
    }
  }

  /**
   * Get all weights for saving
   */
  getWeights(): Record<string, ModelWeights> {
    const weights: Record<string, ModelWeights> = {};
    for (const [className, classifier] of this.classifiers.entries()) {
      weights[className] = classifier.getWeights();
    }
    return weights;
  }

  /**
   * Load weights
   */
  loadWeights(weights: Record<string, ModelWeights>): void {
    for (const [className, classifier] of this.classifiers.entries()) {
      if (weights[className]) {
        classifier.loadWeights(weights[className]);
      }
    }
  }
}

/**
 * Simple Linear Regression
 */
export class LinearRegression {
  private weights: ModelWeights = { bias: 0 };
  private learningRate: number = 0.01;
  private numFeatures: number = 0;

  constructor(numFeatures: number, learningRate: number = 0.01) {
    this.numFeatures = numFeatures;
    this.learningRate = learningRate;
    // Initialize weights randomly
    for (let i = 0; i < numFeatures; i++) {
      this.weights[i.toString()] = (Math.random() - 0.5) * 0.1;
    }
  }

  /**
   * Predict value
   */
  predict(features: number[]): number {
    if (features.length !== this.numFeatures) {
      logger.warn({ expected: this.numFeatures, got: features.length }, 'Feature mismatch');
      return 0;
    }

    let prediction = this.weights.bias;
    for (let i = 0; i < features.length; i++) {
      prediction += this.weights[i.toString()] * features[i];
    }

    return prediction;
  }

  /**
   * Train on single example
   */
  train(features: number[], label: number): void {
    const prediction = this.predict(features);
    const error = label - prediction;

    // Update bias
    this.weights.bias += this.learningRate * error;

    // Update weights
    for (let i = 0; i < features.length; i++) {
      this.weights[i.toString()] += this.learningRate * error * features[i];
    }
  }

  /**
   * Train on batch
   */
  trainBatch(examples: Array<{ features: number[]; label: number }>, epochs: number = 10): void {
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const example of examples) {
        this.train(example.features, example.label);
      }
    }
  }

  /**
   * Get weights for saving
   */
  getWeights(): ModelWeights {
    return { ...this.weights };
  }

  /**
   * Load weights
   */
  loadWeights(weights: ModelWeights): void {
    this.weights = { ...weights };
  }
}
