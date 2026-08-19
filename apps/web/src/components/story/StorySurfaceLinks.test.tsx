import { fireEvent, render, screen } from '../../test/utils';
import { describe, expect, it } from 'vitest';

import { LIFE_STORY_JOB } from '../../lib/lifeStoryCopy';
import { StorySurfaceLinks } from './StorySurfaceLinks';

describe('StorySurfaceLinks', () => {
  it('explains the current page and links to the other three views', () => {
    render(<StorySurfaceLinks current="moments" />);

    expect(screen.getByTestId('life-story-job')).toHaveTextContent(LIFE_STORY_JOB.moments);
    expect(screen.getByLabelText(/how to look at your life/i)).toBeInTheDocument();
    expect(screen.getByText('Moments')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anchors/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Life Saga/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /When they happened/i })).toBeInTheDocument();
  });

  it('navigates to chronology from anchors', () => {
    render(<StorySurfaceLinks current="anchors" />);
    fireEvent.click(screen.getByRole('button', { name: /Timeline/i }));
    expect(window.location.pathname + window.location.search).toBe('/timeline?view=events');
  });

  it('navigates to Life Saga from timeline', () => {
    render(<StorySurfaceLinks current="timeline" />);
    fireEvent.click(screen.getByRole('button', { name: /Life Saga/i }));
    expect(window.location.pathname).toBe('/saga');
  });

  it('can hide the job line when the header already explains the page', () => {
    render(<StorySurfaceLinks current="saga" showJob={false} />);
    expect(screen.queryByTestId('life-story-job')).not.toBeInTheDocument();
    expect(screen.getByText('Life Saga')).toHaveAttribute('aria-current', 'page');
  });
});
