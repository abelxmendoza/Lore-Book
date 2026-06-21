import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComposerEntityChips } from './ComposerEntityChips';
import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';

const span: LexicalPreviewSpan = {
  text: 'Coding Club',
  start: 30,
  end: 41,
  type: 'GROUP',
  colorKey: 'group',
  confidence: 0.8,
  temporary: true,
};

describe('LexicalPreviewEntityChips', () => {
  it('opens correction flow via chip click callback', () => {
    const onSelectPreviewSpan = vi.fn();
    render(
      <ComposerEntityChips
        entities={[]}
        previewSpans={[span]}
        onSelectPreviewSpan={onSelectPreviewSpan}
      />,
    );

    fireEvent.click(screen.getByTestId('lexical-preview-chip-GROUP-30'));
    expect(onSelectPreviewSpan).toHaveBeenCalledWith(span);
  });

  it('shows corrected entity name in chip', () => {
    render(
      <ComposerEntityChips
        entities={[]}
        previewSpans={[{ ...span, type: 'ORGANIZATION', entityStatus: 'new' }]}
        correctedRecords={[
          {
            id: '30:41:ORGANIZATION',
            text: 'Coding Club',
            start: 30,
            end: 41,
            originalType: 'ORGANIZATION',
            correctedType: 'GROUP',
            entityStatus: 'known',
            linkedEntityId: 'group-coding-club',
            linkedEntityName: 'Coding Club',
            correctionAction: 'link_existing_entity',
            userConfirmed: true,
            correctionSource: 'composer',
            parentEntityName: 'La Serna High School',
          },
        ]}
      />
    );

    expect(screen.getByText(/Coding Club/)).toBeTruthy();
    // userConfirmed corrections display as 'confirmed' (see displayStatus).
    expect(screen.getByTestId('lexical-preview-chip-ORGANIZATION-30')).toHaveAttribute(
      'data-entity-status',
      'confirmed'
    );
  });
});
