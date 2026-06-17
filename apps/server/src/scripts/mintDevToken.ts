#!/usr/bin/env tsx
/* Mint a real Supabase session for a user (DEV verification only). */
import { writeFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { config } from '../config';

const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
if (!email) {
  console.error('Usage: npx tsx src/scripts/mintDevToken.ts <email> [out.json]');
  console.error('Or set ADMIN_EMAIL in the environment.');
  process.exit(1);
}
const outPath = process.argv[3] ?? '';

async function main() {
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const otp = (data.properties as { email_otp?: string })?.email_otp;
  if (!otp) throw new Error('No email_otp returned');

  const pub = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
  });
  const { data: sess, error: vErr } = await pub.auth.verifyOtp({ email, token: otp, type: 'magiclink' });
  if (vErr) throw vErr;
  const s = sess.session!;
  const payload = JSON.stringify({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: s.token_type,
    user: s.user,
  });
  if (outPath) {
    writeFileSync(outPath, payload);
    console.error(`SESSION_WRITTEN ${outPath} (${payload.length} bytes) user=${s.user.id}`);
  } else {
    process.stdout.write(payload);
  }
}
main().catch(e => { console.error('MINT_ERROR', e?.message ?? e); process.exit(1); });
