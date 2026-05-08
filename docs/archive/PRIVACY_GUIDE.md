# Privacy Guide: Using Your Real Memoir During Development

## Your Data is Private by Design

Lore Keeper is built with privacy as a core principle. Here's how your memoir and personal information stay private:

### 🔒 Built-in Privacy Features

1. **Row-Level Security (RLS)**
   - Every database table has RLS policies that ensure **only you can see your data**
   - Even if someone had database access, they can't see your entries without your authentication token
   - All queries are automatically filtered by `user_id`

2. **User Isolation**
   - Each user has a unique `user_id` (UUID)
   - All data is scoped to your user ID
   - No cross-user data access is possible

3. **Local Development**
   - When running locally, your data stays on your machine
   - Supabase can be run locally or you can use a private Supabase project
   - No data leaves your local environment unless you explicitly deploy

4. **Authentication Required**
   - All API endpoints require your authentication token
   - Without your token, no one can access your data
   - Tokens are scoped to your user account

## 🛡️ Privacy Options for Development

### Option 1: Local Supabase (Recommended for Maximum Privacy)

Run Supabase entirely on your machine:

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# This gives you:
# - Local PostgreSQL database
# - Local authentication
# - All data stays on your machine
```

**Benefits:**
- ✅ Zero data leaves your computer
- ✅ Complete control over your data
- ✅ No external dependencies
- ✅ Fast development

### Option 2: Private Supabase Project

Create a separate Supabase project just for development:

1. Go to [supabase.com](https://supabase.com)
2. Create a new project (e.g., "LoreKeeper-Dev-Private")
3. Use this project's credentials in your `.env` file
4. **Important:** Don't share this project publicly

**Benefits:**
- ✅ Isolated from production
- ✅ Easy to reset/delete
- ✅ Full control over who has access
- ✅ Can be deleted after development

### Option 3: Development Account

Create a separate development account:

1. Use a different email for development
2. Create a separate Supabase user
3. Upload your memoir to this dev account only
4. Keep your production account separate

**Benefits:**
- ✅ Clear separation between dev and production
- ✅ Easy to test without affecting real data
- ✅ Can delete dev account when done

## 📝 About Language/Text Interference

**Your memoir's language and text will NOT interfere with the build process.**

### Why It's Safe:

1. **Text is Just Data**
   - The app treats your memoir as data, not code
   - Your text is stored in database fields, not executed
   - No code execution happens on your content

2. **AI Processing is Isolated**
   - OpenAI API calls are separate from the build process
   - Your text is sent to OpenAI for analysis only
   - It doesn't affect TypeScript compilation or React builds

3. **Database Storage**
   - Your memoir is stored as text in PostgreSQL
   - Database content doesn't affect application code
   - Migrations and schema are separate from your data

4. **Build Process**
   - `pnpm build` only compiles TypeScript/React code
   - Your memoir data isn't part of the build
   - Build errors come from code, not your content

### What Actually Happens:

```
Your Memoir → Upload → Stored in Database → AI Analysis → Display in UI
                                    ↓
                            (No impact on build)
```

## 🔐 Additional Security Measures

### 1. Environment Variables
Keep your `.env` file private:
- Never commit `.env` to git (it's in `.gitignore`)
- Use different credentials for dev/prod
- Rotate keys if exposed

### 2. Encryption (Optional)
The app supports client-side encryption:
- You can encrypt entries before storing them
- Even database admins can't read encrypted content
- See `apps/web/src/lib/secureStorage.ts` for details

### 3. Data Export/Deletion
You can always:
- Export all your data (`/api/account/export`)
- Delete all your data (`/api/account/delete`)
- Start fresh anytime

## 🚀 Recommended Setup for Development

### Step 1: Local Supabase Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize Supabase in your project
supabase init

# Start local Supabase
supabase start

# Copy the local credentials to your .env file
# (Supabase CLI will show them after starting)
```

### Step 2: Update .env

```env
# Use local Supabase
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>

# Your OpenAI key (this is safe - it's just for AI features)
OPENAI_API_KEY=sk-...
```

### Step 3: Run Migrations

```bash
# Apply database migrations to local Supabase
supabase db reset
```

### Step 4: Start Development

```bash
# Start backend
pnpm run dev:server

# Start frontend (in another terminal)
pnpm run dev:web
```

### Step 5: Upload Your Memoir

1. Sign up/login in the app
2. Go to "My Memoir" tab
3. Click "Upload Document"
4. Upload your memoir file

**All data stays local on your machine!**

## 📋 Checklist Before Uploading

- [ ] Using local Supabase OR private dev project
- [ ] `.env` file is in `.gitignore` (already done)
- [ ] No sensitive credentials in code
- [ ] Understand that data is isolated by user_id
- [ ] Know how to export/delete your data if needed

## 🆘 If You're Still Concerned

### Option A: Use Dummy Data First
1. Create a test memoir with fake names/places
2. Test the app functionality
3. Once comfortable, upload your real memoir

### Option B: Anonymize Your Memoir
1. Replace real names with placeholders (e.g., "Person A", "City X")
2. Remove specific identifying details
3. Keep the structure and style
4. Upload the anonymized version

### Option C: Use a Separate Branch
1. Create a `dev-with-real-data` git branch
2. Work on that branch locally
3. Never push sensitive data
4. Merge code changes (not data) to main branch

## 💡 Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use local Supabase for development** - Maximum privacy
3. **Separate dev and prod accounts** - Clear boundaries
4. **Regular backups** - Export your data periodically
5. **Test with dummy data first** - Build confidence

## ❓ FAQ

**Q: Can my memoir text break the app?**
A: No. Your text is stored as data, not executed as code. Even if you paste code-like text, it's just stored as a string.

**Q: Will my memoir be visible to others?**
A: No. RLS policies ensure only you can see your data. Even if someone had database access, they'd need your auth token.

**Q: Can I delete my data later?**
A: Yes. Use `/api/account/delete` to permanently delete all your data.

**Q: What if I accidentally commit sensitive data?**
A: Use `git filter-branch` or contact GitHub support to remove sensitive data from history. Better: use local Supabase so data never leaves your machine.

**Q: Does OpenAI see my memoir?**
A: Yes, but only for AI analysis (summaries, insights, etc.). OpenAI's privacy policy applies. You can disable AI features if preferred.

## 🎯 Recommended Approach

**For maximum privacy during development:**

1. ✅ Use **local Supabase** (runs entirely on your machine)
2. ✅ Upload your **real memoir** (it stays local)
3. ✅ Develop normally (your text won't interfere)
4. ✅ When ready for production, use a separate Supabase project

Your memoir is safe, private, and won't interfere with the build process. The app is designed to handle any text content safely.

