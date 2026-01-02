/**
 * Accessibility utilities for keyboard navigation, focus management, and screen readers
 */

/**
 * Trap focus within a container (for modals)
 */
export const trapFocus = (container: HTMLElement): (() => void) => {
  const focusableElements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  };
  
  container.addEventListener('keydown', handleTabKey);
  firstElement?.focus();
  
  return () => {
    container.removeEventListener('keydown', handleTabKey);
  };
};

/**
 * Announce message to screen readers
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite'): void => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Skip to main content link handler
 */
export const skipToMainContent = (): void => {
  const mainContent = document.querySelector('main') || document.querySelector('[role="main"]');
  if (mainContent) {
    (mainContent as HTMLElement).focus();
    (mainContent as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

/**
 * Get accessible label for an element
 */
export const getAccessibleLabel = (element: HTMLElement): string => {
  return (
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby') ||
    element.getAttribute('title') ||
    element.textContent?.trim() ||
    ''
  );
};

/**
 * Check if element is visible to screen readers
 */
export const isVisibleToScreenReader = (element: HTMLElement): boolean => {
  const style = window.getComputedStyle(element);
  const ariaHidden = element.getAttribute('aria-hidden') === 'true';
  
  return (
    !ariaHidden &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
};

/**
 * Focus management for modals and dialogs
 */
export class FocusManager {
  private previousFocus: HTMLElement | null = null;
  private trapCleanup: (() => void) | null = null;
  
  trap(container: HTMLElement): void {
    this.previousFocus = document.activeElement as HTMLElement;
    this.trapCleanup = trapFocus(container);
  }
  
  release(): void {
    if (this.trapCleanup) {
      this.trapCleanup();
      this.trapCleanup = null;
    }
    
    // Return focus to previous element
    if (this.previousFocus && document.contains(this.previousFocus)) {
      this.previousFocus.focus();
    }
    this.previousFocus = null;
  }
}

/**
 * Keyboard shortcut handler
 */
export const createKeyboardHandler = (
  shortcuts: Record<string, (e: KeyboardEvent) => void>
): ((e: KeyboardEvent) => void) => {
  return (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const modifier = e.ctrlKey || e.metaKey ? 'ctrl' : e.shiftKey ? 'shift' : '';
    const shortcut = modifier ? `${modifier}+${key}` : key;
    
    const handler = shortcuts[shortcut];
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  };
};

