# How to Enable Mock Data in the UI

There are **multiple ways** to enable mock data and see all the demo content:

## 🚀 Quick Methods

### Method 1: URL Parameter (Easiest)
Add `?mockData=true` to your URL:
```
http://localhost:5173/?mockData=true
```

This will automatically enable mock data when the page loads.

### Method 2: Browser Console (Fastest)
Open browser console (F12) and run:
```javascript
window.enableMockData()
```

This instantly enables mock data and refreshes all components.

### Method 3: Dev Panel Toggle
1. Enable Dev Mode (if not already enabled)
2. Look for the "Developer Diagnostics" panel
3. Find the "Mock Data Mode" toggle
4. Click the switch to turn it ON

### Method 4: Dev Banner (Bottom Left)
Look for the yellow "Development Mode" banner in the bottom-left corner:
- Click the "MOCK OFF" button to toggle it to "MOCK ON"

## 📋 What You'll See

When mock data is enabled, you'll see:

### Discovery Hub Analytics
- ✅ **Soul Profile**: Complete essence profile with hopes, dreams, fears, strengths, weaknesses, skills, values
- ✅ **Shadow Analytics**: Shadow archetypes (Perfectionist, People Pleaser, Inner Critic), loops, triggers
- ✅ **Relationships**: Network graph with Sarah, Mike, Emma, family members, sentiment timeline
- ✅ **XP Analytics**: Level 5, 1250 XP, skills (Python, Guitar, Public Speaking), charts
- ✅ **Achievements**: 5 achievements (First Entry, Week Warrior, Level 5, Skill Master, Month Master)
- ✅ **Reactions & Resilience**: Reaction patterns, insights, stability metrics

### Main Character Profile
- ✅ **Engine Results**: Story of Self, Archetype (The Seeker), Shadow, Growth, Inner Dialogue, Alternate Self, Cognitive Bias, Paracosm

### Core Books
- ✅ **Character Book**: Multiple characters (Sarah Chen, Marcus Johnson, etc.)
- ✅ **Location Book**: Various locations with metadata
- ✅ **Memory Book**: Memory cards with content

### Timeline & Memoir
- ✅ **Timeline**: Mock timelines and chronology entries
- ✅ **Lore Book**: Memoir outline and chapters
- ✅ **Memoir Editor**: Memoir sections

### Other Components
- ✅ **Perceptions**: Perception entries
- ✅ **Continuity Dashboard**: Events, goals, contradictions
- ✅ **Admin Console**: Finance, logs, payments, revenue, subscriptions
- ✅ **Account Center**: User account data, billing

## 🎯 Console Commands

All available in browser console:

```javascript
// Enable mock data
window.enableMockData()

// Disable mock data
window.disableMockData()

// Toggle mock data
window.toggleMockData()

// Check current state
window.isMockDataEnabled()

// Debug info
window.mockDataDebug?.log()
```

## 🔄 Auto-Enable in Dev Mode

Mock data **automatically enables** in development mode by default. If it's not enabled:

1. Check the URL for `?mockData=false` (remove it)
2. Clear localStorage: `localStorage.removeItem('lorebook_use_mock_data')`
3. Refresh the page

## ✅ Verification

After enabling, you should see:
- Yellow "Mock Data Active" banner in components
- Mock data indicator in bottom-right corner
- All components showing sample data
- Console log: `[MockData] Mock data enabled`

## 🎨 Visual Indicators

When mock data is active:
- **Yellow banner** in discovery panels: "📊 Showing mock data for demonstration"
- **Mock Data Indicator** (bottom-right): Yellow notification
- **Dev Banner** (bottom-left): Shows "MOCK ON" button

## 📝 Notes

- Mock data persists in localStorage
- Toggle state is saved across page refreshes
- Real data takes precedence when available
- Mock data only shows when toggle is ON

