# Main Lifestory Biography Implementation

**Date**: 2025-01-27  
**Status**: ✅ Implemented

---

## Overview

The main lifestory biography is now **always available** and **automatically updated** when you chat. All chat entries are automatically integrated into your full lifestory biography/lorebook. Alternative versions can be generated from this main one.

---

## How It Works

### Automatic Integration

**Every chat message you send automatically:**
1. ✅ **Saves as journal entry** (already implemented)
2. ✅ **Updates memoir sections** (already implemented)
3. ✅ **Updates main lifestory biography** (NEW - automatically)

### Main Lifestory Biography

- **Name**: "My Full Life Story"
- **Always Available**: The main lifestory is always accessible via `/api/biography/main-lifestory`
- **Auto-Updates**: Updates automatically when new chat entries are added (debounced to every 5 minutes)
- **Core Lorebook**: Marked as `is_core_lorebook: true` for easy identification
- **Versioned**: Each update creates a new version

### Alternative Versions

You can generate alternative versions from the main lifestory:
- **Safe Version**: Filtered for public sharing (removes sensitive content)
- **Explicit Version**: Full details, including sensitive content
- **Private Version**: Personal introspection included

---

## Implementation Details

### New Service: `mainLifestoryService.ts`

**Key Methods**:
- `ensureMainLifestory(userId, forceRegenerate)` - Ensures main lifestory exists and is up to date
- `getMainLifestory(userId)` - Gets the main lifestory (creates if doesn't exist)
- `updateAfterChatEntry(userId)` - Updates lifestory after new chat entry (debounced)
- `generateAlternativeVersion(userId, version, options)` - Generates alternative versions

### Integration Points

1. **After Chat Entry Saved** (`omegaChatService.ts`):
   - Calls `mainLifestoryService.updateAfterChatEntry()` after saving entry
   - Non-blocking (fire and forget)
   - Debounced to update max once every 5 minutes

2. **API Endpoints** (`routes/biography.ts`):
   - `GET /api/biography/main-lifestory` - Get main lifestory
   - `POST /api/biography/main-lifestory/regenerate` - Force regenerate
   - `POST /api/biography/main-lifestory/alternative` - Generate alternative version

### Update Logic

- **Checks for new entries** since last update
- **Debounces updates** (max once every 5 minutes)
- **Non-blocking** (doesn't slow down chat)
- **Automatic** (no user action required)

---

## User Experience

### Before
- User had to manually generate biographies
- No main lifestory always available
- Had to remember to update biography after chatting

### After
- **Main lifestory always available** - Just access `/api/biography/main-lifestory`
- **Auto-updates automatically** - Every chat entry updates it
- **Alternative versions** - Generate safe/explicit/private versions on demand
- **Zero friction** - Just chat, lifestory updates automatically

---

## Example Flow

1. **User chats**: "I had lunch with Sarah yesterday and we talked about the project."
2. **Entry saved**: Automatically saved as journal entry
3. **Memoir updated**: Memoir sections updated automatically
4. **Lifestory updated**: Main lifestory biography updated automatically (after 5 min debounce)
5. **User accesses**: Gets main lifestory via API - it's always up to date
6. **User generates alternative**: Creates "Safe" version for sharing

---

## Technical Notes

### Debouncing
- Updates are debounced to prevent excessive regeneration
- Only updates if last update was more than 5 minutes ago
- Prevents spam from rapid chat messages

### Versioning
- Each update creates a new version
- Versions are tracked via `lorebook_version`
- Main lifestory always shows latest version

### Performance
- Non-blocking updates (fire and forget)
- Background processing
- Doesn't slow down chat experience

---

## API Usage

### Get Main Lifestory
```typescript
GET /api/biography/main-lifestory
// Returns: { biography: {...} }
```

### Regenerate Main Lifestory
```typescript
POST /api/biography/main-lifestory/regenerate
// Returns: { biography: {...}, message: "Main lifestory regenerated" }
```

### Generate Alternative Version
```typescript
POST /api/biography/main-lifestory/alternative
Body: {
  version: 'safe' | 'explicit' | 'private',
  tone?: 'neutral' | 'dramatic' | 'reflective' | 'mythic' | 'professional',
  depth?: 'summary' | 'detailed' | 'epic',
  audience?: 'self' | 'public' | 'professional'
}
// Returns: { biography: {...} }
```

---

## Future Enhancements (Optional)

1. **Smart Update Detection**: Only update if significant new content
2. **Incremental Updates**: Update only new chapters instead of full regenerate
3. **User Preferences**: Allow users to customize update frequency
4. **Multiple Main Lifestories**: Support domain-specific main lifestories
5. **Auto-Generate Alternatives**: Automatically generate safe version for sharing

---

**END OF DOCUMENTATION**
