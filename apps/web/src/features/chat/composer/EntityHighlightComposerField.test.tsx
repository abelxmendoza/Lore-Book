import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';

import { EntityHighlightComposerField } from './EntityHighlightComposerField';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';

function Harness({
  value,
  matches,
}: {
  value: string;
  matches: CertifiedEntityMatch[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <EntityHighlightComposerField
      value={value}
      onChange={() => {}}
      textareaRef={ref}
      matches={matches}
      placeholder="Type here"
    />
  );
}

const abel: CertifiedEntityMatch = {
  id: 'uuid-abel',
  name: 'Abel',
  type: 'character',
  aliases: [],
  mentionKeys: ['abel'],
  status: 'confirmed',
  matchedLabel: 'Abel',
  matchKind: 'full',
};

describe('EntityHighlightComposerField', () => {
  it('renders a plain textarea without inline highlight overlay', () => {
    render(<Harness value="Tell Abel about work" matches={[abel]} />);

    expect(screen.getByTestId('composer-highlight-field')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Tell Abel about work');
    expect(screen.queryByTestId('composer-entity-highlight-character-uuid-abel')).not.toBeInTheDocument();
  });
});
