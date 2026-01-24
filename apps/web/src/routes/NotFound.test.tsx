import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from './NotFound';

describe('NotFound', () => {
  it('renders 404 and Page Not Found', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getAllByText('404').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('has Go Home, Go Back, and Search buttons', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('Go Home')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders quick links', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });
});
