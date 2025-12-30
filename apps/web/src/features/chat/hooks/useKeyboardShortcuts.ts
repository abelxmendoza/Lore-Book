import { useEffect, useCallback } from 'react';

type KeyboardShortcutsConfig = {
  onSearch?: () => void;
  onCommands?: () => void;
  onDiagnostics?: () => void;
  onEscape?: () => void;
};

export const useKeyboardShortcuts = (config: KeyboardShortcutsConfig) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd+K or Ctrl+K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      config.onSearch?.();
    }
    
    // Cmd+/ or Ctrl+/ for commands
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      config.onCommands?.();
    }
    
    // Cmd+Shift+D or Ctrl+Shift+D for diagnostics
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      config.onDiagnostics?.();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
      config.onEscape?.();
    }
  }, [config]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

