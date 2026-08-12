import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionManager } from './VersionManager';
import { saveDemoCoreLorebook, recompileDemoCoreLorebook } from '../../lib/storyForge/demoCoreLorebookStore';
import { runForgeForPreset } from '../../lib/storyForge/forgeReadinessBridge';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => true,
}));

describe('VersionManager — demo mode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists versions sourced from the demo core lorebook store, no network call', async () => {
    const forge = runForgeForPreset('rich');
    saveDemoCoreLorebook('My Life Story', forge);
    recompileDemoCoreLorebook('My Life Story');

    render(<VersionManager lorebookName="My Life Story" />);

    expect(await screen.findByText('Edition History')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('shows an empty state when no demo editions have been saved yet', async () => {
    render(<VersionManager lorebookName="Never Saved" />);
    expect(await screen.findByText(/no versions found/i)).toBeInTheDocument();
  });

  it('opens a manifest for a version without a network call', async () => {
    const forge = runForgeForPreset('rich');
    saveDemoCoreLorebook('My Life Story', forge);

    render(<VersionManager lorebookName="My Life Story" />);
    await screen.findByText('Edition History');

    const manifestButton = screen.getByTitle('Why does this edition look like this?');
    fireEvent.click(manifestButton);

    expect(await screen.findByText(/knowledge snapshot/i)).toBeInTheDocument();
  });

  it('compares two demo editions and reports differences without a network call', async () => {
    const forge = runForgeForPreset('rich');
    saveDemoCoreLorebook('My Life Story', forge);
    recompileDemoCoreLorebook('My Life Story');

    render(<VersionManager lorebookName="My Life Story" />);
    await screen.findByText('Edition History');

    const compareButtons = screen.getAllByTitle('Compare with latest');
    // The latest (v2) card's own compare button is disabled against itself —
    // click the older (v1) card's button to diff it against the latest.
    const enabled = compareButtons.find((button) => !button.hasAttribute('disabled'));
    expect(enabled).toBeDefined();
    fireEvent.click(enabled!);

    expect(await screen.findByText('What changed')).toBeInTheDocument();
  });
});
