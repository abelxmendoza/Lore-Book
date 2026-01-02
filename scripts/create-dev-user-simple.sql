-- Simple dev user creation for terms acceptance
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new

-- Create dev user (if it doesn't exist)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'dev@example.com',
  '$2a$10$dummy', -- Dummy password hash (won't be used)
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Verify it was created
SELECT id, email, created_at FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000000';

