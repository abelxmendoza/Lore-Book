import type { ReactionPatterns } from '../types/reaction';
import type { PatternInsight, StabilityMetrics } from '../api/perceptionReactionEngine';

export const MOCK_REACTION_PATTERNS: ReactionPatterns = {
  byTrigger: {
    'memory-1': 3,
    'perception-1': 5,
    'memory-2': 2,
    'memory-3': 4,
    'perception-2': 3,
    'memory-4': 1
  },
  byLabel: {
    anxiety: 8,
    anger: 3,
    sadness: 4,
    avoidance: 5,
    rumination: 6,
    fear: 2,
    shame: 1,
    withdrawal: 3,
    overthinking: 4
  },
  byType: {
    emotional: 12,
    behavioral: 6,
    cognitive: 4,
    physical: 2
  },
  intensityAverages: {
    anxiety: 0.7,
    anger: 0.8,
    sadness: 0.6,
    avoidance: 0.5,
    rumination: 0.75,
    fear: 0.65,
    shame: 0.9,
    withdrawal: 0.55,
    overthinking: 0.7
  },
  commonPatterns: [
    {
      trigger_type: 'perception',
      reaction_label: 'anxiety',
      count: 5,
      avg_intensity: 0.7
    },
    {
      trigger_type: 'memory',
      reaction_label: 'anger',
      count: 3,
      avg_intensity: 0.8
    },
    {
      trigger_type: 'perception',
      reaction_label: 'rumination',
      count: 4,
      avg_intensity: 0.75
    },
    {
      trigger_type: 'memory',
      reaction_label: 'avoidance',
      count: 5,
      avg_intensity: 0.5
    },
    {
      trigger_type: 'perception',
      reaction_label: 'sadness',
      count: 2,
      avg_intensity: 0.6
    }
  ]
};

export const MOCK_PATTERN_INSIGHTS: PatternInsight[] = [
  {
    type: 'perception_reaction_loop',
    description: 'This belief about Sarah triggered 5 reactions',
    question: 'What do you notice about how this belief affected you?',
    data: {
      perception_count: 1,
      reaction_count: 5,
      avg_intensity: 0.7,
      confidence_levels: [0.4]
    },
    confidence: 0.8
  },
  {
    type: 'false_alarm',
    description: '3 low-confidence beliefs triggered strong reactions',
    question: 'What do you notice about beliefs you weren\'t sure about but still affected you strongly?',
    data: {
      perception_count: 3,
      reaction_count: 8,
      avg_intensity: 0.75,
      confidence_levels: [0.3, 0.35, 0.4]
    },
    confidence: 0.7
  },
  {
    type: 'regulation_trend',
    description: 'Your recovery times have decreased over time',
    question: 'What do you notice about how you\'ve been handling reactions differently?',
    data: {
      recovery_times: [120, 90, 75, 60, 45],
      time_span_days: 30
    },
    confidence: 0.7
  },
  {
    type: 'recovery_pattern',
    description: 'Recovery times are faster for emotional reactions than cognitive ones',
    question: 'What helps you recover from emotional reactions more quickly?',
    data: {
      recovery_times: [45, 60, 75, 90],
      avg_intensity: 0.65
    },
    confidence: 0.75
  },
  {
    type: 'belief_impact',
    description: 'High-confidence beliefs triggered fewer but more intense reactions',
    question: 'How do beliefs you\'re certain about affect you differently than uncertain ones?',
    data: {
      perception_count: 5,
      reaction_count: 6,
      avg_intensity: 0.85,
      confidence_levels: [0.8, 0.85, 0.9, 0.75, 0.8]
    },
    confidence: 0.8
  }
];

export const MOCK_STABILITY_METRICS: StabilityMetrics = {
  avg_recovery_time_minutes: 75,
  recovery_trend: 'improving',
  recurrence_rate: 0.3,
  intensity_trend: 'decreasing',
  resilience_score: 0.72
};

// Recovery time data for chart (last 30 days)
export const MOCK_RECOVERY_TIME_DATA = [
  { date: '2024-01-01', recovery_time: 120, intensity: 0.8 },
  { date: '2024-01-05', recovery_time: 110, intensity: 0.75 },
  { date: '2024-01-10', recovery_time: 95, intensity: 0.7 },
  { date: '2024-01-15', recovery_time: 85, intensity: 0.65 },
  { date: '2024-01-20', recovery_time: 75, intensity: 0.6 },
  { date: '2024-01-25', recovery_time: 65, intensity: 0.55 },
  { date: '2024-01-30', recovery_time: 60, intensity: 0.5 }
];

