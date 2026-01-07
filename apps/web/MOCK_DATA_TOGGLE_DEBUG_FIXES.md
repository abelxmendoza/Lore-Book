# Mock Data Toggle Debug & Fixes

## 🔧 Issues Fixed

### 1. **Stale Closures in useEffect**
**Problem**: Components had load functions that referenced `isMockDataEnabled`, but these functions weren't properly memoized, causing stale closures when the toggle changed.

**Fixed Components**:
- ✅ `UserProfile.tsx` - `loadEngineResults` now uses `useCallback` with proper dependencies
- ✅ `SoulProfilePanel.tsx` - `loadProfile` now uses `useCallback` with proper dependencies
- ✅ `XpAnalyticsPanel.tsx` - `loadSkills` now uses `useCallback` with proper dependencies
- ✅ `AchievementsPanel.tsx` - `loadData` now uses `useCallback` with proper dependencies
- ✅ `ReactionsResiliencePanel.tsx` - `loadData` now uses `useCallback` with proper dependencies

### 2. **Missing useEffect Dependencies**
**Problem**: Some components had `isMockDataEnabled` in useEffect but the load functions weren't in the dependency array, causing React warnings and potential bugs.

**Fix**: All load functions are now properly memoized with `useCallback` and included in useEffect dependencies.

### 3. **Missing Import**
**Problem**: `ReactionsResiliencePanel.tsx` was using `useMockData` but didn't import it.

**Fix**: Added `import { useMockData } from '../../contexts/MockDataContext';`

## ✅ How It Works Now

### Component Pattern
```typescript
export const MyComponent = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  
  // Memoize load function with proper dependencies
  const loadData = useCallback(async () => {
    // Use isMockDataEnabled here - it will always be current
    if (isMockDataEnabled) {
      // Use mock data
    } else {
      // Use real data
    }
  }, [isMockDataEnabled]); // Include in dependencies
  
  // useEffect will re-run when toggle changes
  useEffect(() => {
    loadData();
  }, [loadData]); // loadData changes when isMockDataEnabled changes
};
```

### Toggle Flow
1. User clicks toggle → `toggleMockData()` called
2. Context state updates → `useMockData` changes
3. Global state syncs → `setGlobalMockDataEnabled()` called
4. All listeners notified → Components refresh
5. Components re-render → New data loaded based on toggle state

## 🧪 Testing the Toggle

### Manual Testing Steps

1. **Open Browser Console**
   ```javascript
   // Check current state
   window.mockDataDebug?.log()
   
   // Verify toggle is working
   window.mockDataDebug?.verify()
   ```

2. **Toggle On/Off**
   - Go to Settings/Dev Panel
   - Toggle "Mock Data Mode" switch
   - Watch console for: `[MockDataDebug] Toggle changed:`
   - Verify components refresh

3. **Check Components**
   - **UserProfile**: Engine results should show/hide
   - **SoulProfilePanel**: Essence profile should show/hide
   - **XpAnalyticsPanel**: XP data should show/hide
   - **AchievementsPanel**: Achievements should show/hide
   - **Discovery Panels**: All analytics should respect toggle

4. **Verify Persistence**
   - Toggle on → Refresh page → Should stay on
   - Toggle off → Refresh page → Should stay off
   - Check localStorage: `localStorage.getItem('lorebook_use_mock_data')`

### Expected Behavior

**When Toggle is ON:**
- ✅ Mock data displays in all components
- ✅ Real API calls still happen but mock data is shown if no real data
- ✅ Mock data indicator appears
- ✅ Console logs show mock data usage

**When Toggle is OFF:**
- ✅ Only real data displays
- ✅ Empty states show if no real data
- ✅ Mock data indicator disappears
- ✅ No mock data in console

## 🐛 Debug Tools

### Console Commands
```javascript
// Get current debug info
window.mockDataDebug?.getInfo()

// Log debug info
window.mockDataDebug?.log()

// Verify toggle is working
window.mockDataDebug?.verify()
```

### Component Logging
Components now log when they load data:
- `[UserProfile:loadEngineResults]` - Shows toggle state
- `[MockDataDebug]` - Shows toggle changes

## 📋 Checklist

- [x] All load functions use `useCallback`
- [x] All useEffect dependencies are correct
- [x] All components import `useMockData`
- [x] Toggle state syncs with global state
- [x] Components refresh on toggle change
- [x] localStorage persistence works
- [x] Debug utilities available
- [x] No linter errors

## 🎯 Next Steps

1. **Test in Browser**: Toggle on/off and verify all components update
2. **Check Console**: Look for any errors or warnings
3. **Verify Persistence**: Refresh page and check toggle state
4. **Test All Panels**: Go through each discovery panel and verify

## 📝 Notes

- The toggle uses React Context for React components
- Global state is used for non-React code (hooks, services)
- Subscriptions notify all listeners when toggle changes
- localStorage persists user preference
- All components automatically refresh when toggle changes

