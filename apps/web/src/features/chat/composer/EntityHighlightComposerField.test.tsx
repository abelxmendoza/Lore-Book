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

const romantic: CertifiedEntityMatch = {
  id: 'uuid-kelly',
  name: 'Kelly',
  type: 'character',
  characterVariant: 'romantic',
  aliases: [],
  mentionKeys: ['kelly'],
  status: 'confirmed',
  matchedLabel: 'Kelly',
  matchKind: 'full',
};

describe('EntityHighlightComposerField', () => {
  it('renders highlight marks for known entities', () => {
    render(<Harness value="Tell Abel about work" matches={[abel]} />);

    expect(screen.getByTestId('composer-highlight-field')).toBeInTheDocument();
    expect(
      screen.getByTestId('composer-entity-highlight-character-uuid-abel', { hidden: true })
    ).toHaveTextContent('Abel');
  });

  it('uses rose styling for romantic interests', () => {
    render(<Harness value="I saw Kelly today" matches={[romantic]} />);

    const mark = screen.getByTestId('composer-entity-highlight-romantic-uuid-kelly', { hidden: true });
    expect(mark).toHaveTextContent('Kelly');
    expect(mark.className).toContain('entity-hl-romantic');
  });
});
