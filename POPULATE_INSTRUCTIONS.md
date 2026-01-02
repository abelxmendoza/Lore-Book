# How to Populate Your App with Dummy Data

## 🚨 Important: Server Must Be Running First!

Before populating data, make sure your **server is running**:
```bash
# In Terminal 1
pnpm dev:server

# Wait until you see: "Lore Keeper API listening on 4000"
```

## 📋 Step-by-Step Instructions

### Option 1: Browser Console (Recommended)

1. **Start the server** (if not already running):
   ```bash
   pnpm dev:server
   ```

2. **Open your browser** to http://localhost:5173

3. **Open Developer Console**:
   - Press `F12` or `Cmd+Option+J` (Mac) / `Ctrl+Shift+J` (Windows/Linux)
   - Or right-click → Inspect → Console tab

4. **Copy the script**:
   - Open `scripts/populate-quick.js` in your editor
   - Copy the **entire file** (all 98 lines)

5. **Paste into console**:
   - Click in the console
   - Paste the script
   - Press `Enter`

6. **Watch the progress**:
   - You'll see messages like:
     ```
     📖 Step 1: Creating chapters...
       ✓ The Beginning
       ✓ Growth Phase
       ✓ Current Chapter
     👥 Step 2: Creating characters...
       ✓ Sarah Chen
       ✓ Marcus Johnson
       ...
     ```

7. **Page will auto-refresh** when done!

### Option 2: Use the "Populate Data" Button

If the button on the homepage works, you can click it directly. However, it may have the same server issues.

## 🐛 Troubleshooting

### Issue: "HTTP 500" errors
**Solution:**
1. Check if server is running: `lsof -ti:4000`
2. Check server logs in the terminal where you ran `pnpm dev:server`
3. Verify `.env` file has correct Supabase credentials
4. Make sure database tables exist (run migrations if needed)

### Issue: "Cannot connect to API"
**Solution:**
- Server might still be starting up (wait 10-15 seconds)
- Check server terminal for errors
- Verify server is listening on port 4000

### Issue: "Some data created but not all"
**Solution:**
- This is normal - some endpoints may fail
- Check console for specific errors
- Re-run the script - it's safe to run multiple times

## 📊 What Gets Created

The quick script creates:
- **3 Chapters** (The Beginning, Growth Phase, Current Chapter)
- **5 Characters** (Sarah Chen, Marcus Johnson, Alex Rivera, Jordan Kim, The Coffee Shop)
- **10 Journal Entries** with relationships and tags

The full script (`populate-complete-dummy-user.js`) creates:
- **5 Chapters** spanning 2 years
- **10+ Characters** with detailed profiles
- **30+ Journal Entries** with rich content
- **Tasks** and milestones

## ✅ Verify It Worked

After running the script, check:
1. **User Profile** - Should show entry count, character count, chapters
2. **Character Book** - Should show 5+ characters
3. **Timeline** - Should show entries with dates
4. **Chapters** - Should show 3-5 chapters

## 🔄 Re-running

The scripts are **idempotent** - safe to run multiple times. If you want to start fresh:
1. Clear database: `supabase db reset` (if using local Supabase)
2. Or manually delete entries through the UI
3. Re-run the script

---

**Quick Script Location:** `scripts/populate-quick.js`  
**Full Script Location:** `scripts/populate-complete-dummy-user.js`

