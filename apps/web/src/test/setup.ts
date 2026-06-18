import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { server } from './mocks/server';
import { cleanup } from '@testing-library/react';

const storageStore = new Map<string, string>();
let storagePrototypePatched = false;
let storageEventPatched = false;

const patchStoragePrototype = () => {
  if (storagePrototypePatched || typeof Storage === 'undefined') return;

  Object.defineProperties(Storage.prototype, {
    clear: {
      configurable: true,
      value: vi.fn(() => {
        storageStore.clear();
      }),
    },
    getItem: {
      configurable: true,
      value: vi.fn((key: string) => storageStore.get(String(key)) ?? null),
    },
    key: {
      configurable: true,
      value: vi.fn((index: number) => Array.from(storageStore.keys())[index] ?? null),
    },
    removeItem: {
      configurable: true,
      value: vi.fn((key: string) => {
        storageStore.delete(String(key));
      }),
    },
    setItem: {
      configurable: true,
      value: vi.fn((key: string, value: string) => {
        storageStore.set(String(key), String(value));
      }),
    },
  });

  storagePrototypePatched = true;
};

const createMemoryStorage = (): Storage => {
  patchStoragePrototype();

  const storage = Object.create(
    typeof Storage !== 'undefined' ? Storage.prototype : Object.prototype
  ) as Storage;

  Object.defineProperty(storage, 'length', {
    configurable: true,
    get: () => storageStore.size,
  });

  if (typeof Storage === 'undefined') {
    Object.assign(storage, {
      clear: vi.fn(() => storageStore.clear()),
      getItem: vi.fn((key: string) => storageStore.get(String(key)) ?? null),
      key: vi.fn((index: number) => Array.from(storageStore.keys())[index] ?? null),
      removeItem: vi.fn((key: string) => {
        storageStore.delete(String(key));
      }),
      setItem: vi.fn((key: string, value: string) => {
        storageStore.set(String(key), String(value));
      }),
    });
  }

  return storage;
};

const installStorageEventShim = () => {
  if (storageEventPatched) return;

  class TestStorageEvent extends Event {
    readonly key: string | null;
    readonly newValue: string | null;
    readonly oldValue: string | null;
    readonly storageArea: Storage | null;
    readonly url: string;

    constructor(type: string, eventInitDict: StorageEventInit = {}) {
      super(type, eventInitDict);
      this.key = eventInitDict.key ?? null;
      this.newValue = eventInitDict.newValue ?? null;
      this.oldValue = eventInitDict.oldValue ?? null;
      this.storageArea = eventInitDict.storageArea ?? null;
      this.url = eventInitDict.url ?? '';
    }
  }

  vi.stubGlobal('StorageEvent', TestStorageEvent);
  storageEventPatched = true;
};

const installStorageIfNeeded = () => {
  installStorageEventShim();

  const current = window.localStorage;
  const isUsable = current &&
    typeof current.getItem === 'function' &&
    typeof current.setItem === 'function' &&
    typeof current.removeItem === 'function' &&
    typeof current.clear === 'function';

  if (isUsable) return;

  if (current && typeof Storage !== 'undefined' && current instanceof Storage) {
    patchStoragePrototype();
    return;
  }

  const storage = createMemoryStorage();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  vi.stubGlobal('localStorage', storage);
};

// Establish API mocking before all tests
beforeAll(() => {
  installStorageIfNeeded();
  server.listen({ onUnhandledRequest: 'warn' });
  
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  } as any;

  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    unobserve() {}
  } as any;

  // Set up environment variables for tests
  process.env.VITE_API_URL = 'http://localhost:3000';
  process.env.VITE_USE_MOCK_DATA = 'true';
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-key';
});

// Reset any request handlers that are declared as a part of our tests
// (i.e. for testing one-time error scenarios)
afterEach(() => {
  cleanup();
  installStorageIfNeeded();
  window.localStorage.clear();
  // Clear fetch mocks
  vi.clearAllMocks();
});

// Suppress console errors in tests unless explicitly testing them
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Warning: validateDOMNesting') ||
        args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
