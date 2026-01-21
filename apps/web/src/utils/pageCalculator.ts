/**
 * Page Calculator Utilities
 * Calculates how to split content into book pages based on viewport and typography settings
 */

export interface PageCalculationOptions {
  fontSize: number; // in pixels
  lineHeight: number; // multiplier (e.g., 1.7)
  containerHeight: number; // available height in pixels
  containerWidth: number; // available width in pixels
  marginTop: number; // top margin in pixels
  marginBottom: number; // bottom margin in pixels
  marginLeft: number; // left margin in pixels
  marginRight: number; // right margin in pixels
  padding: number; // additional padding in pixels
}

export interface BookPage {
  id: string;
  sectionIndex: number;
  pageNumber: number;
  content: string;
  totalPagesInSection: number;
  wordCount: number;
}

/**
 * Calculate how many pages a section needs
 */
export function calculatePagesForSection(
  content: string,
  sectionIndex: number,
  options: PageCalculationOptions
): BookPage[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const pages: BookPage[] = [];
  
  // Calculate available space
  const availableHeight = options.containerHeight - options.marginTop - options.marginBottom - (options.padding * 2);
  const availableWidth = options.containerWidth - options.marginLeft - options.marginRight - (options.padding * 2);
  
  // Calculate line height in pixels
  const lineHeightPx = options.fontSize * options.lineHeight;
  
  // Estimate lines per page
  const linesPerPage = Math.floor(availableHeight / lineHeightPx);
  
  // Estimate characters per line (rough estimate: ~60-80 chars per line for readable text)
  const avgCharsPerLine = Math.floor(availableWidth / (options.fontSize * 0.6)); // Rough estimate
  const charsPerPage = linesPerPage * avgCharsPerLine;
  
  // Split content into pages, respecting paragraph boundaries
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  let currentPageContent = '';
  let currentPageNumber = 1;
  let currentChars = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length;
    const trimmedParagraph = paragraph.trim() + '\n\n';
    
    // If paragraph alone exceeds page, split it
    if (paragraphLength > charsPerPage) {
      // Save current page if it has content
      if (currentPageContent.trim().length > 0) {
        pages.push(createPage(
          sectionIndex,
          currentPageNumber,
          currentPageContent.trim(),
          pages.length + 1 // Will be updated later
        ));
        currentPageContent = '';
        currentChars = 0;
        currentPageNumber++;
      }
      
      // Split long paragraph into chunks
      const chunks = splitLongText(trimmedParagraph, charsPerPage);
      for (const chunk of chunks) {
        pages.push(createPage(
          sectionIndex,
          currentPageNumber,
          chunk.trim(),
          pages.length + 1
        ));
        currentPageNumber++;
      }
      currentPageContent = '';
      currentChars = 0;
    } else {
      // Check if adding this paragraph would exceed page
      if (currentChars + paragraphLength > charsPerPage && currentPageContent.trim().length > 0) {
        // Save current page
        pages.push(createPage(
          sectionIndex,
          currentPageNumber,
          currentPageContent.trim(),
          pages.length + 1
        ));
        currentPageContent = trimmedParagraph;
        currentChars = paragraphLength;
        currentPageNumber++;
      } else {
        // Add paragraph to current page
        currentPageContent += trimmedParagraph;
        currentChars += paragraphLength;
      }
    }
  }
  
  // Add final page if there's content
  if (currentPageContent.trim().length > 0) {
    pages.push(createPage(
      sectionIndex,
      currentPageNumber,
      currentPageContent.trim(),
      pages.length + 1
    ));
  }
  
  // Update totalPagesInSection for all pages
  const totalPages = pages.length;
  pages.forEach(page => {
    page.totalPagesInSection = totalPages;
  });
  
  return pages;
}

/**
 * Split long text into chunks that fit on a page
 */
function splitLongText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > maxChars) {
    // Try to split at sentence boundary
    const chunk = remaining.substring(0, maxChars);
    const lastPeriod = chunk.lastIndexOf('. ');
    const lastNewline = chunk.lastIndexOf('\n');
    const splitPoint = Math.max(lastPeriod, lastNewline);
    
    if (splitPoint > maxChars * 0.5) {
      // Good split point found
      chunks.push(remaining.substring(0, splitPoint + 1).trim());
      remaining = remaining.substring(splitPoint + 1).trim();
    } else {
      // No good split point, force split
      chunks.push(remaining.substring(0, maxChars).trim());
      remaining = remaining.substring(maxChars).trim();
    }
  }
  
  if (remaining.trim().length > 0) {
    chunks.push(remaining.trim());
  }
  
  return chunks;
}

/**
 * Create a page object
 */
function createPage(
  sectionIndex: number,
  pageNumber: number,
  content: string,
  totalPages: number
): BookPage {
  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
  
  return {
    id: `section-${sectionIndex}-page-${pageNumber}`,
    sectionIndex,
    pageNumber,
    content,
    totalPagesInSection: totalPages,
    wordCount
  };
}

/**
 * Get viewport dimensions
 */
export function getViewportDimensions(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 };
  }
  
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

/**
 * Calculate font size in pixels from size name
 */
export function fontSizeToPixels(size: 'sm' | 'base' | 'lg' | 'xl'): number {
  const baseFontSize = 16; // Base browser font size
  
  const sizes = {
    sm: baseFontSize * 0.875, // 14px
    base: baseFontSize, // 16px
    lg: baseFontSize * 1.125, // 18px
    xl: baseFontSize * 1.25 // 20px
  };
  
  return sizes[size];
}

/**
 * Calculate line height multiplier from name
 */
export function lineHeightToMultiplier(height: 'normal' | 'relaxed' | 'loose'): number {
  const multipliers = {
    normal: 1.5,
    relaxed: 1.7,
    loose: 2.0
  };
  
  return multipliers[height];
}
