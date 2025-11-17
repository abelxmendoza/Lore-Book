# Quick Start Guide - Get Lore Keeper Running

## 🚀 Fastest Path to Working App

### Step 1: Set Up Environment (5 minutes)

```bash
# 1. Install dependencies
pnpm install

# 2. Create .env file in project root
cat > .env << EOF
# Supabase (use local for development)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key

# OpenAI (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-key-here

# Server
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
EOF
```

### Step 2: Set Up Local Supabase (10 minutes)

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase
supabase init

# Start Supabase (this will show you the keys to add to .env)
supabase start

# Copy the credentials shown to your .env file
# They'll look like:
# SUPABASE_URL=http://localhost:54321
# SUPABASE_ANON_KEY=eyJhbGc...
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Run migrations
supabase db reset
```

### Step 3: Start the App (2 minutes)

```bash
# Terminal 1: Start server
pnpm dev:server

# Terminal 2: Start web app
pnpm dev:web

# Should see:
# - Server: "Lore Keeper API listening on 4000"
# - Web: "Local: http://localhost:5173"
```

### Step 4: Populate Dummy Data (1 minute)

1. Open browser: http://localhost:5173
2. Open browser console (F12)
3. Copy and paste the script from `populate-browser-console.js`
4. Press Enter
5. Wait for "Population complete!"
6. Page will refresh automatically

### Step 5: Verify Everything Works

✅ Check these:
- [ ] Server is running (check terminal)
- [ ] Web app loads (http://localhost:5173)
- [ ] No console errors
- [ ] Can see user profile
- [ ] Can see characters
- [ ] Can see entries
- [ ] Can create new entry

## 🐛 Common Issues & Fixes

### Issue: "Cannot connect to database"
**Fix**: 
- Make sure Supabase is running: `supabase status`
- Check .env file has correct credentials
- Restart server after updating .env

### Issue: "500 Internal Server Error"
**Fix**:
- Check server logs in terminal
- Verify database tables exist: `supabase db reset`
- Check .env file is correct

### Issue: "Module not found"
**Fix**:
- Run `pnpm install` again
- Delete `node_modules` and reinstall
- Check Node.js version: `node --version` (should be 18+)

### Issue: "Port already in use"
**Fix**:
- Change PORT in .env to different number
- Or kill process using port: `lsof -ti:4000 | xargs kill`

## 📝 Next Steps After Setup

1. **Explore the UI**
   - Check out Character Book
   - View Timeline
   - Try creating an entry

2. **Test Features**
   - Create a character
   - Add relationships
   - Create chapters
   - Write journal entries

3. **Customize**
   - Add your own data
   - Customize character profiles
   - Create your memoir

4. **Develop**
   - Read IMPROVEMENT_PLAN.md
   - Pick a feature to work on
   - Check existing issues

## 🎯 Development Commands

```bash
# Start everything
pnpm dev

# Start individually
pnpm dev:server  # Backend only
pnpm dev:web     # Frontend only

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

# Reset database
supabase db reset

# Check environment
cd apps/server && pnpm check-env
```

## 📚 Useful Resources

- **Supabase Dashboard**: http://localhost:54323 (when running locally)
- **API Docs**: Check `apps/server/src/routes/` for endpoints
- **Component Library**: Check `apps/web/src/components/`
- **Database Schema**: Check `migrations/` folder

## ✅ Success Checklist

- [ ] Supabase is running locally
- [ ] .env file is configured
- [ ] Migrations are applied
- [ ] Server starts without errors
- [ ] Web app loads
- [ ] Can create entries
- [ ] Can view characters
- [ ] No console errors

---

**Need Help?** Check `IMPROVEMENT_PLAN.md` for detailed troubleshooting and expansion ideas!

