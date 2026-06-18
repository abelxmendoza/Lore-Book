import type { EnhancedStore } from '@reduxjs/toolkit';

let registeredStore: EnhancedStore | null = null;

export function registerAppStore(store: EnhancedStore): void {
  registeredStore = store;
}

export function getAppStore(): EnhancedStore {
  if (!registeredStore) {
    throw new Error('Redux app store is not registered yet');
  }
  return registeredStore;
}

/** Test-only helper to attach an isolated store instance. */
export function registerAppStoreForTests(store: EnhancedStore): void {
  registeredStore = store;
}

export function clearAppStoreRegistrationForTests(): void {
  registeredStore = null;
}
