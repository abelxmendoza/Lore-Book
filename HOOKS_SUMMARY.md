# React Hooks Summary

This document summarizes all the custom React hooks available in the LoreKeeper application.

## Utility Hooks

### `useFetch<T>`
A powerful hook for data fetching with automatic retry logic, error handling, and caching.

**Features:**
- Automatic retry with exponential backoff
- Error handling with user-friendly messages
- Loading states
- Cache integration
- Type-safe
- Abort controller for cleanup

**Usage:**
```typescript
const { data, loading, error, errorMessage, refetch, clearError, isRetryable } = useFetch<UserData>(
  '/api/user/profile',
  {
    immediate: true,
    retry: {
      maxRetries: 3,
      initialDelay: 1000,
      backoffFactor: 2,
    },
    onSuccess: (data) => console.log('Loaded:', data),
    onError: (error) => console.error('Error:', error),
    componentName: 'UserProfile',
  }
);
```

### `usePolling<T>`
Fetches data at regular intervals (polling).

**Usage:**
```typescript
const { data, loading, error } = usePolling<StatusData>(
  '/api/status',
  5000, // Poll every 5 seconds
  { immediate: true }
);
```

### `useLazyFetch<T>`
Fetches data only when manually triggered (doesn't fetch on mount).

**Usage:**
```typescript
const { data, loading, error, refetch } = useLazyFetch<Data>(
  '/api/data',
  { onSuccess: handleSuccess }
);

// Later, trigger fetch:
await refetch();
```

### `useLocalStorage<T>`
Syncs state with localStorage, with cross-tab synchronization.

**Features:**
- Automatic JSON serialization/deserialization
- Cross-tab synchronization
- Error handling
- Type-safe

**Usage:**
```typescript
const [value, setValue, removeValue] = useLocalStorage<string>(
  'my-key',
  'default-value'
);

// Use like useState
setValue('new-value');

// Remove from localStorage
removeValue();
```

### `useDebounce<T>`
Debounces a value, useful for search inputs and API calls.

**Usage:**
```typescript
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearchTerm = useDebounce(searchTerm, 500);

useEffect(() => {
  // This will only run 500ms after user stops typing
  performSearch(debouncedSearchTerm);
}, [debouncedSearchTerm]);
```

### `useDebouncedCallback<T>`
Debounces a callback function.

**Usage:**
```typescript
const debouncedSave = useDebouncedCallback(
  (data: FormData) => {
    saveToServer(data);
  },
  1000 // Wait 1 second after last call
);

// Call multiple times rapidly, only last one executes
debouncedSave(formData);
```

### `useIntersectionObserver`
Observes when an element enters or leaves the viewport.

**Features:**
- Lazy loading
- Infinite scroll
- Animations
- Performance optimization

**Usage:**
```typescript
const { ref, isIntersecting, intersectionRatio, entry, observe, unobserve } = 
  useIntersectionObserver({
    threshold: 0.5,
    rootMargin: '50px',
    immediate: true,
  });

return <div ref={ref}>Content</div>;
```

## Application-Specific Hooks

### `useLoreKeeper`
Main hook for LoreKeeper data management.

**Provides:**
- Entries management
- Timeline data
- Chapters
- Refresh functions

### `useChatStream`
Handles streaming chat responses from the AI.

**Features:**
- Server-Sent Events (SSE)
- Real-time message updates
- Cancellation support

### `useSubscription`
Manages user subscription status and usage.

**Features:**
- Subscription status
- Usage tracking
- Plan management
- Trial information

### `useContinuity`
Manages continuity checking and conflict resolution.

**Features:**
- Continuity snapshots
- Conflict detection
- Merge suggestions
- State management

### `useTimelineData`
Fetches and manages timeline data.

**Features:**
- Entries
- Eras
- Sagas
- Arcs
- Filtering

### `useExternalHub`
Manages external integrations (GitHub, etc.).

**Features:**
- Source status
- Timeline entries
- Ingest functionality

### `useAnalytics`
Fetches analytics data for modules.

**Features:**
- Module-specific analytics
- Multiple module support
- Real-time updates

### `useCharacterData`
Manages character information.

### `useMemoryFabric`
Manages memory fabric graph data.

### `useAutopilot`
Manages autopilot features and momentum signals.

### `useVoiceRecorder`
Handles voice recording functionality.

### `useKeyboardShortcuts`
Manages keyboard shortcuts.

### `useFeatureFlag`
Checks feature flag status.

### `useVerification`
Handles verification processes.

### `useTermsAcceptance`
Manages terms of service acceptance.

## Best Practices

1. **Use `useFetch` for API calls**: Instead of manual `fetch` calls, use `useFetch` for automatic retry and error handling.

2. **Use `useLocalStorage` for persistence**: Instead of direct `localStorage` access, use the hook for type safety and cross-tab sync.

3. **Debounce search inputs**: Use `useDebounce` to avoid excessive API calls.

4. **Lazy load images**: Use `useIntersectionObserver` for lazy loading images and other content.

5. **Poll for updates**: Use `usePolling` for real-time data that needs regular updates.

6. **Handle errors gracefully**: All hooks provide error states - always check and display user-friendly messages.

## Migration Guide

### From manual fetch to useFetch

**Before:**
```typescript
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetch('/api/data')
    .then(res => res.json())
    .then(setData)
    .catch(setError)
    .finally(() => setLoading(false));
}, []);
```

**After:**
```typescript
const { data, loading, error } = useFetch('/api/data');
```

### From localStorage to useLocalStorage

**Before:**
```typescript
const [value, setValue] = useState(() => {
  const saved = localStorage.getItem('key');
  return saved ? JSON.parse(saved) : defaultValue;
});

useEffect(() => {
  localStorage.setItem('key', JSON.stringify(value));
}, [value]);
```

**After:**
```typescript
const [value, setValue] = useLocalStorage('key', defaultValue);
```

## Testing

All hooks can be tested using React Testing Library:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useFetch } from './useFetch';

test('fetches data', async () => {
  const { result } = renderHook(() => useFetch('/api/data'));
  
  expect(result.current.loading).toBe(true);
  
  await waitFor(() => {
    expect(result.current.loading).toBe(false);
  });
  
  expect(result.current.data).toBeDefined();
});
```

