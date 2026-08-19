import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from './Footer';

describe('Footer', () => {
  it('keeps the home footer content and destinations stable', () => {
    render(<Footer />);

    expect(
      screen.getByText('© 2025 Omega Technologies — Built by Abel Mendoza.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy-policy',
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Ownership' })).toHaveAttribute(
      'href',
      '/home#ownership',
    );
  });

  it('uses flex spacing instead of fixed positioning', () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector('footer');

    expect(footer).toHaveClass('mt-auto', 'shrink-0');
    expect(footer).not.toHaveClass('fixed', 'absolute');
  });
});
