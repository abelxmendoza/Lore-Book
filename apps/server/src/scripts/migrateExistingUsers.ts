import { createClient } from '@supabase/supabase-js';

import { config } from '../config';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

/**
 * Migration script to set all existing users to free tier
 * Run this once when introducing subscriptions
 */
async function migrateExistingUsers() {
  console.log('Starting migration of existing users to free tier...');

  try {
    // Get all users from auth.users
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    if (!users || users.users.length === 0) {
      console.log('No users found to migrate.');
      return;
    }

    console.log(`Found ${users.users.length} users to migrate.`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users.users) {
      try {
        // Check if subscription already exists
        const { data: existing } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          console.log(`  User ${user.email || user.id}: Subscription already exists, skipping`);
          skipped++;
          continue;
        }

        // Create free tier subscription
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: user.id,
            status: 'active',
            plan_type: 'free',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            cancel_at_period_end: false,
          });

        if (insertError) {
          console.error(`  User ${user.email || user.id}: Failed to create subscription - ${insertError.message}`);
          errors++;
          continue;
        }

        console.log(`  User ${user.email || user.id}: Migrated to free tier`);
        migrated++;
      } catch (error) {
        console.error(`  User ${user.email || user.id}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`);
        errors++;
      }
    }

    console.log('\nMigration complete:');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateExistingUsers()
    .then(() => {
      console.log('Migration script completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateExistingUsers };

