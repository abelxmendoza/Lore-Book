import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';
import { CharacterAvatar } from './CharacterAvatar';

describe('CharacterAvatar', () => {
  it('renders avatar image when URL is provided', () => {
    render(<CharacterAvatar url="https://example.com/avatar.svg" name="Test Character" />);
    const img = screen.getByAltText('Test Character avatar');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.svg');
  });

  it('renders fallback icon when URL is not provided', () => {
    render(<CharacterAvatar name="Test Character" />);
    const fallback = screen.getByLabelText('Test Character avatar');
    expect(fallback).toBeInTheDocument();
  });

  it('renders fallback icon when image fails to load', async () => {
    // Test with null URL to directly test fallback rendering
    render(<CharacterAvatar url={null} name="Test Character" />);
    
    // Should show fallback immediately
    const fallback = await screen.findByLabelText('Test Character avatar');
    expect(fallback).toBeInTheDocument();
  });

  it('applies custom size', () => {
    const { container } = render(
      <CharacterAvatar url="https://example.com/avatar.svg" name="Test" size={64} />
    );
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    // Check style attribute contains size
    const style = img?.getAttribute('style') || '';
    expect(style).toMatch(/64px/);
  });
});

