import { describe, it, expect } from 'vitest';
import {
  calculatePagesForSection,
  getViewportDimensions,
  fontSizeToPixels,
  lineHeightToMultiplier,
} from './pageCalculator';

describe('pageCalculator', () => {
  const baseOptions = {
    fontSize: 22,
    lineHeight: 1.7,
    containerHeight: 800,
    containerWidth: 400,
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 20,
    marginRight: 20,
    padding: 16,
  };

  describe('calculatePagesForSection', () => {
    it('returns empty array for empty content', () => {
      expect(calculatePagesForSection('', 0, baseOptions)).toEqual([]);
      expect(calculatePagesForSection('   \n\n  ', 0, baseOptions)).toEqual([]);
    });

    it('returns at least one page for short content', () => {
      const pages = calculatePagesForSection('Hello world.', 0, baseOptions);
      expect(pages.length).toBeGreaterThanOrEqual(1);
      expect(pages[0].content).toContain('Hello');
      expect(pages[0].sectionIndex).toBe(0);
      expect(pages[0].pageNumber).toBe(1);
      expect(typeof pages[0].wordCount).toBe('number');
      expect(typeof pages[0].totalPagesInSection).toBe('number');
    });

    it('respects paragraph boundaries', () => {
      const content = 'A\n\nB\n\nC';
      const pages = calculatePagesForSection(content, 0, baseOptions);
      const full = pages.map((p) => p.content).join('');
      expect(full).toContain('A');
      expect(full).toContain('B');
      expect(full).toContain('C');
    });
  });

  describe('getViewportDimensions', () => {
    it('returns object with numeric width and height', () => {
      const d = getViewportDimensions();
      expect(d).toHaveProperty('width');
      expect(d).toHaveProperty('height');
      expect(typeof d.width).toBe('number');
      expect(typeof d.height).toBe('number');
    });
  });

  describe('fontSizeToPixels', () => {
    it('maps sm to 18', () => expect(fontSizeToPixels('sm')).toBe(18));
    it('maps base to 22', () => expect(fontSizeToPixels('base')).toBe(22));
    it('maps lg to 26', () => expect(fontSizeToPixels('lg')).toBe(26));
    it('maps xl to 30', () => expect(fontSizeToPixels('xl')).toBe(30));
  });

  describe('lineHeightToMultiplier', () => {
    it('maps normal to 1.7', () => expect(lineHeightToMultiplier('normal')).toBe(1.7));
    it('maps relaxed to 1.9', () => expect(lineHeightToMultiplier('relaxed')).toBe(1.9));
    it('maps loose to 2.2', () => expect(lineHeightToMultiplier('loose')).toBe(2.2));
  });
});
