import { fireEvent, render, screen } from '../../test/utils';
import { describe, expect, it } from 'vitest';

import { LifeSagaLink, ViewOnTimelineLink } from './timelineSurfaceHandoff';

describe('timelineSurfaceHandoff', () => {
  it('sends chronology readers to Life Saga', () => {
    render(<LifeSagaLink />);
    fireEvent.click(screen.getByTestId('read-in-life-saga'));
    expect(window.location.pathname).toBe('/saga');
  });

  it('sends saga readers back to chronology', () => {
    render(<ViewOnTimelineLink />);
    fireEvent.click(screen.getByTestId('view-on-timeline'));
    expect(window.location.pathname + window.location.search).toBe('/timeline?view=events');
  });
});
