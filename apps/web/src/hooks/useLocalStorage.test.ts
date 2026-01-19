import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');
  });

  it('should initialize with value from localStorage if it exists', () => {
    localStorage.setItem('test-key', JSON.stringify('stored-value'));

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('stored-value');
  });

  it('should update localStorage when value changes', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('updated-value');
    });

    expect(result.current[0]).toBe('updated-value');
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('updated-value'));
  });

  it('should support function updates', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
  });

  it('should remove value from localStorage when removeValue is called', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('value');
    });

    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('value'));

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe('initial');
    expect(localStorage.getItem('test-key')).toBeNull();
  });

  it('should handle complex objects', () => {
    const initialValue = { name: 'Test', count: 0 };
    const { result } = renderHook(() => useLocalStorage('test-key', initialValue));

    act(() => {
      result.current[1]({ name: 'Updated', count: 1 });
    });

    expect(result.current[0]).toEqual({ name: 'Updated', count: 1 });
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify({ name: 'Updated', count: 1 }));
  });

  it('should handle arrays', () => {
    const initialValue: string[] = [];
    const { result } = renderHook(() => useLocalStorage('test-key', initialValue));

    act(() => {
      result.current[1](['item1', 'item2']);
    });

    expect(result.current[0]).toEqual(['item1', 'item2']);
  });

  it('should handle storage events from other tabs', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'test-key',
        newValue: JSON.stringify('updated-from-other-tab'),
        oldValue: JSON.stringify('initial'),
        storageArea: localStorage,
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('updated-from-other-tab');
  });

  it('should ignore storage events for different keys', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      const event = new StorageEvent('storage', {
        key: 'other-key',
        newValue: JSON.stringify('other-value'),
        oldValue: null,
        storageArea: localStorage,
      });
      window.dispatchEvent(event);
    });

    expect(result.current[0]).toBe('initial');
  });

  it('should handle JSON parse errors gracefully', () => {
    localStorage.setItem('test-key', 'invalid-json');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle localStorage setItem errors gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('value');
    });

    // Should not crash, but value might not be set
    expect(consoleSpy).toHaveBeenCalled();

    setItemSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('should work with SSR (window undefined)', () => {
    const originalWindow = global.window;
    // @ts-expect-error - intentionally setting to undefined for SSR test
    delete (global as any).window;

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');

    act(() => {
      result.current[1]('value');
    });

    // Should not crash in SSR - value should be set in state even if localStorage isn't available
    expect(result.current[0]).toBe('value');

    // Restore window
    (global as any).window = originalWindow;
  });
});
