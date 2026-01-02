/**
 * Security utilities - Complete implementation
 * This file ensures all security features are properly integrated
 */

export * from './security';
export * from './accessibility';

// Re-export for convenience
export { sanitizeHtml, sanitizeInput, secureStorage, getCsrfToken, addCsrfHeaders } from './security';
export { 
  trapFocus, 
  announceToScreenReader, 
  skipToMainContent, 
  getAccessibleLabel,
  isVisibleToScreenReader,
  FocusManager,
  createKeyboardHandler
} from './accessibility';

