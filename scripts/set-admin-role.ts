/**
 * Script to set admin role for a specific user
 * 
 * Usage:
 *   tsx scripts/set-admin-role.ts <email>
 * 
 * This script sets the admin role in Supabase user metadata
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.resolve(rootDir, '.env.development') });
dotenv.config({ path: path.resolve(rootDir, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - VITE_SUPABASE_URL or SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setAdminRole(email: string) {
  console.log(`🔍 Looking up user with email: ${email}...`);

  // Find user by email
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Failed to list users:', listError.message);
    process.exit(1);
  }

  const user = users.users.find(u => u.email === email);

  if (!user) {
    console.error(`❌ User with email ${email} not found.`);
    console.log('\n📋 Available users:');
    users.users.forEach(u => {
      console.log(`   - ${u.email} (${u.id})`);
    });
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (${user.id})`);

  // Update user metadata to set admin role
  const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: {
        ...user.user_metadata,
        role: 'admin'
      },
      app_metadata: {
        ...user.app_metadata,
        role: 'admin'
      }
    }
  );

  if (updateError) {
    console.error('❌ Failed to update user:', updateError.message);
    process.exit(1);
  }

  console.log('\n✅ Successfully set admin role!');
  console.log(`\n📋 User details:`);
  console.log(`   Email: ${updatedUser.user.email}`);
  console.log(`   ID: ${updatedUser.user.id}`);
  console.log(`   User Metadata Role: ${updatedUser.user.user_metadata?.role || 'none'}`);
  console.log(`   App Metadata Role: ${updatedUser.user.app_metadata?.role || 'none'}`);
  console.log('\n🎉 You now have admin access!');
}

// Get email from command line argument or use default
const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
if (!email) {
  console.error('Usage: tsx scripts/set-admin-role.ts <email>');
  process.exit(1);
}

setAdminRole(email).catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});

