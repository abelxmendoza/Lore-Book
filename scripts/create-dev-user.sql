-- Create dev user for testing
-- Run this in Supabase SQL Editor if dev mode user doesn't exist

-- Insert dev user into auth.users
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
  crypt('dev-password', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Also insert into auth.identities for the user
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  '{"sub": "00000000-0000-0000-0000-000000000000", "email": "dev@example.com"}',
  'email',
  now(),
  now(),
  now()
) ON CONFLICT DO NOTHING;

