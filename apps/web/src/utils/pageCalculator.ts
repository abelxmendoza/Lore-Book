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
  
  // Estimate lines per page - account for header/footer space
  // Optimize for ebook reading experience
  const headerFooterSpace = 60; // Space for section title and page number
  const textAreaHeight = Math.max(availableHeight - headerFooterSpace, availableHeight * 0.90); // Use 90% of available height for content
  const linesPerPage = Math.max(1, Math.floor(textAreaHeight / lineHeightPx));
  
  // Estimate characters per line - more accurate calculation
  // Average character width is approximately 0.6 * font size for most fonts
  const avgCharsPerLine = Math.floor(availableWidth / (options.fontSize * 0.55)); // Slightly more accurate
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
 * Must match BookPage component font sizes
 */
export function fontSizeToPixels(size: 'sm' | 'base' | 'lg' | 'xl'): number {
  // Match BookPage component font sizes exactly
  const sizes = {
    sm: 18,
    base: 22,
    lg: 26,
    xl: 30
  };
  
  return sizes[size];
}

/**
 * Calculate line height multiplier from name
 * Must match BookPage component line heights
 */
export function lineHeightToMultiplier(height: 'normal' | 'relaxed' | 'loose'): number {
  // Match BookPage component line heights exactly
  const multipliers = {
    normal: 1.7,
    relaxed: 1.9,
    loose: 2.2
  };
  
  return multipliers[height];
}
