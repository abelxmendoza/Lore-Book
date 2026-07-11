import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeBadge } from './ModeBadge';

describe('ModeBadge', () => {
  it('does not duplicate the consolidated guest/demo notice', () => {
    render(<ModeBadge />);
    expect(screen.queryByRole('button', { name: /dismiss guest indicator/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss mock data indicator/i })).not.toBeInTheDocument();
  });
});
