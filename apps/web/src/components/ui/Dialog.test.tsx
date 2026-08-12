import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent } from './dialog';

function renderDialog(onOpenChange: (open: boolean) => void) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <button type="button">Kids Together</button>
      </DialogContent>
    </Dialog>,
  );
  return screen.getByRole('dialog');
}

describe('Dialog', () => {
  it('dismisses when the backdrop is both pressed and clicked', () => {
    const onOpenChange = vi.fn();
    const backdrop = renderDialog(onOpenChange);

    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open when a press inside the panel releases over the backdrop', () => {
    const onOpenChange = vi.fn();
    const backdrop = renderDialog(onOpenChange);

    // Switching to a shorter tab re-lays out the panel mid-click, so the
    // browser dispatches the click on the backdrop (the common ancestor).
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Kids Together' }));
    fireEvent.click(backdrop);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('stays open when the panel itself is clicked', () => {
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Kids Together' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kids Together' }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
