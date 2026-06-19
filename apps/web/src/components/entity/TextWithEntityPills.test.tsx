import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextWithEntityPills } from './TextWithEntityPills';
import type { EntityMentionRef } from '../../lib/entityMentions';

const entities: EntityMentionRef[] = [
  { id: 'c1', name: 'Abel', type: 'character', status: 'confirmed' },
  { id: 'l1', name: 'Anaheim', type: 'location', status: 'confirmed' },
  { id: 'r1', name: 'Kelly', type: 'character', characterVariant: 'romantic', status: 'confirmed' },
];

describe('TextWithEntityPills', () => {
  it('wraps known entity names in colored pill badges', () => {
    render(
      <TextWithEntityPills
        text="Abel met Kelly in Anaheim."
        entities={entities}
      />
    );

    expect(screen.getByTestId('entity-mention-pill-character-c1')).toHaveTextContent('Abel');
    expect(screen.getByTestId('entity-mention-pill-romantic-r1')).toHaveTextContent('Kelly');
    expect(screen.getByTestId('entity-mention-pill-location-l1')).toHaveTextContent('Anaheim');
  });

  it('returns plain text when there are no entities', () => {
    render(<TextWithEntityPills text="Hello world" entities={[]} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });
});
