import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComposerChromeTray } from './ComposerChromeTray';

describe('ComposerChromeTray', () => {
  it('hides empty chrome when children render nothing', () => {
    const { container } = render(
      <ComposerChromeTray>
        {null}
      </ComposerChromeTray>,
    );
    expect(screen.queryByTestId('composer-chrome-toggle')).not.toBeInTheDocument();
    expect(container.querySelector('[data-collapsed]')).toBeNull();
  });

  it('starts collapsed and reveals children on expand', () => {
    render(
      <ComposerChromeTray defaultCollapsed>
        <div data-testid="chrome-child">Focus chip</div>
      </ComposerChromeTray>,
    );

    expect(screen.getByTestId('composer-chrome-tray')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByTestId('chrome-child')).not.toBeVisible();

    fireEvent.click(screen.getByTestId('composer-chrome-toggle'));

    expect(screen.getByTestId('composer-chrome-tray')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('chrome-child')).toBeVisible();
  });

  it('shows source count on the shared toggle and opens when sources arrive', () => {
    const { rerender } = render(
      <ComposerChromeTray defaultCollapsed meta="2 sources">
        <div data-testid="chrome-child">Sources</div>
      </ComposerChromeTray>,
    );

    expect(screen.getByTestId('composer-chrome-toggle')).toHaveTextContent(/2 sources/i);
    expect(screen.getByTestId('composer-chrome-tray')).toHaveAttribute('data-collapsed', 'true');

    rerender(
      <ComposerChromeTray defaultCollapsed meta="2 sources" expandSignal="character:c1|entry:e1">
        <div data-testid="chrome-child">Sources</div>
      </ComposerChromeTray>,
    );

    expect(screen.getByTestId('composer-chrome-tray')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByTestId('chrome-child')).toBeVisible();
  });
});
