import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LorebookEvidenceReview } from './LorebookEvidenceReview';
import type { LoreReadinessEvaluation } from '../../lib/loreReadiness';

const readyEval: LoreReadinessEvaluation = {
  label: 'Ready',
  level: 'ready',
  progress: 1,
  canGenerate: true,
  atomCount: 40,
  entryCount: 12,
  wordCount: 8000,
  estimatedPages: 18,
  atomsNeeded: 0,
  entriesNeeded: 0,
  gaps: [],
  dimensionScores: {
    volume: 1,
    diversity: 0.8,
    anchoring: 0.7,
    temporal: 0.9,
    evidence: 0.85,
  },
  suggestions: ['Enough evidence to compile a detailed book.'],
};

describe('LorebookEvidenceReview', () => {
  it('shows evidence counts and compiles when ready', () => {
    const onConfirm = vi.fn();
    render(
      <LorebookEvidenceReview
        evaluation={readyEval}
        query="my complete life story"
        onConfirmCompile={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByTestId('lorebook-evidence-review')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText(/my complete life story/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Compile this book/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});
