# Complete Dummy User Population Guide

This guide will help you populate your Lore Keeper app with a comprehensive test user profile containing rich, realistic data.

## 🎯 What Gets Created

The dummy user includes:
- **5 Chapters** spanning 2 years of life journey
- **30+ Journal Entries** with varied content, moods, and tags
- **10+ Characters** including friends, mentors, family, and places
- **Tasks** and milestones
- **Rich relationships** between entries and characters
- **Timeline events** properly distributed across chapters

## 🚀 Quick Start

### Method 1: Browser Console (Recommended)

1. **Start your servers:**
   ```bash
   # Terminal 1
   pnpm dev:server
   
   # Terminal 2
   pnpm dev:web
   ```

2. **Open the app:**
   - Navigate to http://localhost:5173
   - Open browser console (F12 → Console tab)

3. **Run the script:**
   - Open `scripts/populate-complete-dummy-user.js`
   - Copy the entire file content
   - Paste into browser console
   - Press Enter

4. **Wait for completion:**
   - The script will show progress as it creates data
   - Page will auto-refresh when done
   - Check the console for summary

### Method 2: Server-Side Script (Alternative)

If browser console doesn't work, you can create a server-side script:

```bash
# Create a Node.js script that uses the API directly
node scripts/populate-dummy-user-server.js
```

## 📊 What You'll See

After population, you'll have:

### Chapters
1. **The Awakening: Discovering Purpose** (2 years ago - 1.5 years ago)
2. **Building Foundations: Growth & Learning** (1.5 years ago - 1 year ago)
3. **Challenges & Resilience: Weathering Storms** (1 year ago - 6 months ago)
4. **Transformation: New Perspectives** (6 months ago - 2 months ago)
5. **Current Chapter: Living Intentionally** (2 months ago - present)

### Characters Created
- **Sarah Chen** - Best Friend (closest relationship)
- **Marcus Johnson** - Mentor & Coach
- **Alex Rivera** - Creative Collaborator
- **Jordan Kim** - Sibling
- **Dr. Maya Patel** - Life Coach
- **Emma Thompson** - Friend (Writing Group)
- **River Brooks** - Friend (Mindfulness)
- **The Coffee Shop** - Workspace
- **Central Park** - Reflection Space
- **The Library** - Learning Space

### Entry Types
- Daily reflections
- Conversations with characters
- Achievements and milestones
- Challenges and growth
- Creative work sessions
- Learning experiences
- Relationship moments
- Nature and mindfulness

## 🔍 Verifying the Data

After population, check:

1. **Character Book:**
   - Should show 10+ characters
   - Each character has relationships
   - Character profiles are populated

2. **Timeline:**
   - Should show entries spanning 2 years
   - Entries are grouped by date
   - Chapters are visible

3. **Chapters:**
   - 5 chapters visible
   - Each chapter has entries
   - Timeline spans correctly

4. **User Profile:**
   - Stats should show entries count
   - Timeline span should be ~2 years
   - Writing streak calculated

## 🐛 Troubleshooting

### Issue: "HTTP 500" errors
**Solution:**
- Make sure server is running (`pnpm dev:server`)
- Check server logs for specific errors
- Verify `.env` file has correct Supabase credentials

### Issue: "Cannot connect to API"
**Solution:**
- Verify server is running on port 4000
- Check browser console for CORS errors
- Ensure you're on http://localhost:5173

### Issue: "Some entries didn't create"
**Solution:**
- Check console for specific error messages
- Some entries may fail if characters don't exist yet
- Re-run the script - it's idempotent (safe to run multiple times)

### Issue: "Characters not showing relationships"
**Solution:**
- Characters are auto-detected from entries
- Relationships are created when entries mention characters
- May take a moment to process

## 📝 Customizing the Data

To customize the dummy user:

1. **Edit the script:**
   - Modify character names/details in `characters` array
   - Change entry content in `entryTemplates` array
   - Adjust chapter titles/dates in `chapters` array

2. **Add more entries:**
   - Copy an entry template
   - Modify content, tags, mood, date
   - Add to `entryTemplates` array

3. **Add more characters:**
   - Copy a character template
   - Modify name, role, summary, tags
   - Add to `characters` array

## 🎨 Data Characteristics

The dummy user is designed to showcase:
- **Realistic relationships** - Characters appear multiple times
- **Temporal progression** - Entries span realistic timeline
- **Emotional variety** - Different moods and themes
- **Rich metadata** - Tags, summaries, relationships
- **Chapter organization** - Entries properly grouped
- **Character development** - Characters have depth and history

## 🔄 Re-running the Script

The script is **idempotent** - safe to run multiple times:
- Existing data won't be duplicated (if IDs are checked)
- New data will be added
- Useful for testing different scenarios

To start fresh:
1. Clear database: `supabase db reset` (if using local Supabase)
2. Or manually delete entries/characters through UI
3. Re-run the population script

## 📚 Next Steps

After populating:
1. **Explore the UI** - See how data appears in different views
2. **Test features** - Try search, filters, character relationships
3. **Test chat** - The chatbot will have rich context to work with
4. **Add your own data** - Start adding real entries alongside dummy data

---

**Need Help?** Check the console logs for detailed error messages, or review the server logs for backend issues.

