# Admin Role Setup

## Current Admin User

**Email:** abelxmendoza@gmail.com  
**Name:** Abel Mendoza

This email is hardcoded as the admin user in the application.

## How Admin Access Works

The application checks for admin access in this order:

1. **Email Match** (Primary): If user email matches `abelxmendoza@gmail.com`
2. **User ID Match**: If `VITE_ADMIN_USER_ID` or `ADMIN_USER_ID` env var matches user ID
3. **Role Metadata**: If `user_metadata.role` or `app_metadata.role` is `'admin'` or `'developer'`

## Setting Admin Role in Supabase

### Option 1: Run the Script (Recommended)

```bash
cd apps/server
npm install  # if needed
tsx ../scripts/set-admin-role.ts abelxmendoza@gmail.com
```

This will:
- Find your user by email
- Set `user_metadata.role = 'admin'`
- Set `app_metadata.role = 'admin'`

### Option 2: Manual Setup via Supabase Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Find user with email `abelxmendoza@gmail.com`
3. Click on the user
4. In "User Metadata" section, add:
   ```json
   {
     "role": "admin"
   }
   ```
5. In "App Metadata" section, add:
   ```json
   {
     "role": "admin"
   }
   ```

### Option 3: SQL Query (Advanced)

Run this in Supabase SQL Editor:

```sql
-- Set admin role for Abel Mendoza
UPDATE auth.users
SET 
  raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{role}',
    '"admin"'
  ),
  raw_app_meta_data = jsonb_set(
    COALESCE(raw_app_meta_data, '{}'::jsonb),
    '{role}',
    '"admin"'
  )
WHERE email = 'abelxmendoza@gmail.com';
```

## Verification

After setting up, you should see:
- ✅ "Admin Console" button in the sidebar (after Account Center)
- ✅ Access to `/admin` route
- ✅ Admin features available

## Environment Variables (Optional)

You can also set these in your `.env` files:

```bash
# Frontend (.env.development or .env.production)
VITE_ADMIN_EMAIL=abelxmendoza@gmail.com
VITE_ADMIN_USER_ID=your-user-id-here  # Optional, if you know your user ID

# Backend (.env.development or .env.production)
ADMIN_EMAIL=abelxmendoza@gmail.com
ADMIN_USER_ID=your-user-id-here  # Optional
```

## Notes

- The email check (`abelxmendoza@gmail.com`) is the primary method and works immediately
- Role metadata is a backup method and requires running the script or manual setup
- In development mode, admin access is more permissive for testing
- In production, admin access is strictly enforced
