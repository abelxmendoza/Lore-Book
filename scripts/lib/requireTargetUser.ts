/**
 * Maintenance scripts must never default to the founder account.
 * Require an explicit --user / --user-id or TARGET_USER_* env var.
 */

export function parseArg(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

export function requireTargetUserEmail(argv: string[]): string {
  const email = parseArg(argv, '--user') || process.env.TARGET_USER_EMAIL;
  if (!email?.trim()) {
    console.error('Required: --user <email> or TARGET_USER_EMAIL environment variable.');
    console.error('Never run maintenance scripts without an explicit target user.');
    process.exit(1);
  }
  return email.trim();
}

export function requireTargetUserId(argv: string[]): string {
  const id = parseArg(argv, '--user-id') || process.env.TARGET_USER_ID;
  if (!id?.trim()) {
    console.error('Required: --user-id <uuid> or TARGET_USER_ID environment variable.');
    console.error('Never run maintenance scripts without an explicit target user.');
    process.exit(1);
  }
  return id.trim();
}
