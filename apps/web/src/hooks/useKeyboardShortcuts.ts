import { useEffect, useCallback } from 'react';

type ShortcutHandler = () => void;

type ShortcutConfig = {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description?: string;
};

export const useKeyboardShortcuts = (shortcuts: ShortcutConfig[]) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable elements
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const shiftMatch = shortcut.shift === undefined ? true : shortcut.shift === event.shiftKey;
        const altMatch = shortcut.alt === undefined ? true : shortcut.alt === event.altKey;

        // Cmd on Mac vs Ctrl on Windows/Linux: meta:true means Cmd+K (Mac) or Ctrl+K (Win/Linux)
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        let modifierMatch: boolean;
        if (shortcut.meta) {
          modifierMatch = isMac ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey);
        } else if (shortcut.ctrl) {
          modifierMatch = event.ctrlKey;
        } else {
          modifierMatch = !event.ctrlKey && !event.metaKey;
        }

        if (keyMatch && modifierMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

// Common shortcuts
export const COMMON_SHORTCUTS = {
  SEARCH: { key: 'k', meta: true, description: 'Open search' },
  NEW_ENTRY: { key: 'n', meta: true, description: 'New entry' },
  ESCAPE: { key: 'Escape', description: 'Close modal' }
};

