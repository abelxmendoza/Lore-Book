import { fireEvent, render, screen } from '../../test/utils';
import { describe, expect, it } from 'vitest';

import { StorySurfaceLinks } from './StorySurfaceLinks';

describe('StorySurfaceLinks', () => {
  it('marks the current surface and links to the other two', () => {
    render(<StorySurfaceLinks current="moments" />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Moments')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anchors/i })).toBeInTheDocument();
  });

  it('navigates to timeline from anchors', () => {
    render(<StorySurfaceLinks current="anchors" />);
    fireEvent.click(screen.getByRole('button', { name: /Timeline/i }));
    expect(window.location.pathname + window.location.search).toBe('/timeline?view=events');
  });
});
