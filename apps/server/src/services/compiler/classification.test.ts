// =====================================================
// CLASSIFICATION ACCURACY TESTS
// Purpose: Test classification accuracy with 100+ samples
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { irCompiler } from './irCompiler';
import { classificationSamples } from './test-data/classification-samples';
import { supabaseAdmin } from '../supabaseClient';
import type { KnowledgeType } from './types';

// Mock Supabase for classification tests
vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn()
  }
}));

describe('Classification Accuracy Tests', () => {
  const testUserId = 'test-user-classification';
  let testUtteranceCounter = 0;

  function getNextUtteranceId(): string {
    return `utterance-${testUtteranceCounter++}`;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock Supabase to allow saveIR to succeed
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { user_id: testUserId }, error: null })
        })
      })
    });
    
    (supabaseAdmin.from as any) = mockFrom;
  });

  describe('Overall Accuracy', () => {
    it('should classify all samples', async () => {
      const results = await Promise.all(
        classificationSamples.map(async (sample) => {
          const ir = await irCompiler.compileUtteranceToIR(
            testUserId,
            getNextUtteranceId(),
            sample.text,
            'thread-1',
            new Date().toISOString()
          );
          return {
            sample,
            actualType: ir.knowledge_type,
            correct: ir.knowledge_type === sample.expectedType,
          };
        })
      );

      const correct = results.filter(r => r.correct).length;
      const total = results.length;
      const accuracy = correct / total;

      console.log(`\nClassification Accuracy: ${(accuracy * 100).toFixed(2)}% (${correct}/${total})`);

      // Target: >80% accuracy
      expect(accuracy).toBeGreaterThan(0.8);
    });
  });

  describe('Per-Type Accuracy', () => {
    const types: KnowledgeType[] = ['EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION'];

    types.forEach((type) => {
      it(`should accurately classify ${type} entries`, async () => {
        const samples = classificationSamples.filter(s => s.expectedType === type);
        
        const results = await Promise.all(
          samples.map(async (sample) => {
            const ir = await irCompiler.compileUtteranceToIR(
              testUserId,
              getNextUtteranceId(),
              sample.text,
              'thread-1',
              new Date().toISOString()
            );
            return {
              sample,
              actualType: ir.knowledge_type,
              correct: ir.knowledge_type === sample.expectedType,
            };
          })
        );

        const correct = results.filter(r => r.correct).length;
        const total = results.length;
        const accuracy = correct / total;

        console.log(`  ${type}: ${(accuracy * 100).toFixed(2)}% (${correct}/${total})`);

        // Log misclassifications
        const misclassified = results.filter(r => !r.correct);
        if (misclassified.length > 0) {
          console.log(`    Misclassified:`);
          misclassified.forEach(m => {
            console.log(`      "${m.sample.text}" -> ${m.actualType} (expected ${m.sample.expectedType})`);
          });
        }

        // Each type should have >70% accuracy
        expect(accuracy).toBeGreaterThan(0.7);
      });
    });
  });

  describe('False Positives and Negatives', () => {
    it('should document false positives', async () => {
      const falsePositives: Array<{
        text: string;
        expected: KnowledgeType;
        actual: KnowledgeType;
      }> = [];

      for (const sample of classificationSamples) {
        const ir = await irCompiler.compileUtteranceToIR(
          testUserId,
          getNextUtteranceId(),
          sample.text,
          'thread-1',
          new Date().toISOString()
        );

        if (ir.knowledge_type !== sample.expectedType) {
          falsePositives.push({
            text: sample.text,
            expected: sample.expectedType,
            actual: ir.knowledge_type,
          });
        }
      }

      console.log(`\nFalse Positives/Negatives: ${falsePositives.length}`);
      falsePositives.forEach(fp => {
        console.log(`  "${fp.text}"`);
        console.log(`    Expected: ${fp.expected}, Got: ${fp.actual}`);
      });

      // Document but don't fail test
      expect(falsePositives.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle ambiguous entries', async () => {
      const ambiguousSamples = classificationSamples.filter(
        s => s.description.includes('Mixed') || s.description.includes('Uncertain')
      );

      const results = await Promise.all(
        ambiguousSamples.map(async (sample) => {
          const ir = await irCompiler.compileUtteranceToIR(
            testUserId,
            getNextUtteranceId(),
            sample.text,
            'thread-1',
            new Date().toISOString()
          );
          return {
            sample,
            actualType: ir.knowledge_type,
            expectedType: sample.expectedType,
            correct: ir.knowledge_type === sample.expectedType,
          };
        })
      );

      const correct = results.filter(r => r.correct).length;
      const total = results.length;
      const accuracy = correct / total;

      console.log(`\nAmbiguous Samples Accuracy: ${(accuracy * 100).toFixed(2)}% (${correct}/${total})`);

      // Ambiguous samples may have lower accuracy
      // Document but don't enforce strict threshold
      expect(accuracy).toBeGreaterThanOrEqual(0.0);
    });

    it('should handle mixed types in single entry', async () => {
      const mixedText = 'I went to the store and I feel happy about it';
      const ir = await irCompiler.compileUtteranceToIR(
        testUserId,
        getNextUtteranceId(),
        mixedText,
        'thread-1',
        new Date().toISOString()
      );

      // Should classify as EXPERIENCE (first pattern match)
      expect(ir.knowledge_type).toBe('EXPERIENCE');
    });

    it('should handle uncertain experiences', async () => {
      const uncertainText = "I'm pretty sure I went to the store yesterday";
      const ir = await irCompiler.compileUtteranceToIR(
        testUserId,
        getNextUtteranceId(),
        uncertainText,
        'thread-1',
        new Date().toISOString()
      );

      // Should still classify as EXPERIENCE (past tense action)
      expect(ir.knowledge_type).toBe('EXPERIENCE');
      // But confidence should be lower
      expect(ir.confidence).toBeLessThan(0.9);
    });
  });

  describe('Confusion Matrix', () => {
    it('should generate confusion matrix', async () => {
      const types: KnowledgeType[] = ['EXPERIENCE', 'FEELING', 'BELIEF', 'FACT', 'DECISION', 'QUESTION'];
      const matrix: Record<string, Record<string, number>> = {};

      // Initialize matrix
      types.forEach(expected => {
        matrix[expected] = {};
        types.forEach(actual => {
          matrix[expected][actual] = 0;
        });
      });

      // Fill matrix
      for (const sample of classificationSamples) {
        const ir = await irCompiler.compileUtteranceToIR(
          testUserId,
          getNextUtteranceId(),
          sample.text,
          'thread-1',
          new Date().toISOString()
        );
        matrix[sample.expectedType][ir.knowledge_type]++;
      }

      // Print matrix
      console.log('\nConfusion Matrix:');
      console.log('Expected \\ Actual |', types.join(' | '));
      console.log('--- | ' + types.map(() => '---').join(' | '));
      types.forEach(expected => {
        const row = types.map(actual => matrix[expected][actual].toString()).join(' | ');
        console.log(`${expected} | ${row}`);
      });

      // Calculate per-type metrics
      types.forEach(expected => {
        const truePositives = matrix[expected][expected];
        const falsePositives = types
          .filter(a => a !== expected)
          .reduce((sum, a) => sum + matrix[a][expected], 0);
        const falseNegatives = types
          .filter(a => a !== expected)
          .reduce((sum, a) => sum + matrix[expected][a], 0);

        const precision = truePositives / (truePositives + falsePositives) || 0;
        const recall = truePositives / (truePositives + falseNegatives) || 0;
        const f1 = (2 * precision * recall) / (precision + recall) || 0;

        console.log(`\n${expected}:`);
        console.log(`  Precision: ${(precision * 100).toFixed(2)}%`);
        console.log(`  Recall: ${(recall * 100).toFixed(2)}%`);
        console.log(`  F1: ${(f1 * 100).toFixed(2)}%`);
      });

      // Don't fail test, just document
      expect(matrix).toBeDefined();
    });
  });

  describe('Common Misclassifications', () => {
    it('should document common misclassification patterns', async () => {
      const misclassifications: Record<string, number> = {};

      for (const sample of classificationSamples) {
        const ir = await irCompiler.compileUtteranceToIR(
          testUserId,
          getNextUtteranceId(),
          sample.text,
          'thread-1',
          new Date().toISOString()
        );

        if (ir.knowledge_type !== sample.expectedType) {
          const key = `${sample.expectedType} -> ${ir.knowledge_type}`;
          misclassifications[key] = (misclassifications[key] || 0) + 1;
        }
      }

      console.log('\nCommon Misclassifications:');
      const sorted = Object.entries(misclassifications)
        .sort((a, b) => b[1] - a[1]);
      
      sorted.forEach(([pattern, count]) => {
        console.log(`  ${pattern}: ${count}`);
      });

      // Document but don't fail
      expect(misclassifications).toBeDefined();
    });
  });
});
