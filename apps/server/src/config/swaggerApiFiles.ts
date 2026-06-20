import { readdirSync, type Dirent } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Resolve route/controller source files to explicit paths for swagger-jsdoc.
 *
 * We intentionally avoid '**' globs here. swagger-jsdoc bundles glob@7, and the
 * security-pinned minimatch@9 encodes '**' as a GLOBSTAR Symbol that glob@7's
 * sync scanner cannot stringify (`pattern.join('/')`), which threw at import
 * time and crashed the entire server on boot. Passing plain file paths sidesteps
 * the broken globstar code path while still giving swagger-jsdoc real files to
 * read JSDoc @swagger annotations from.
 */
export function resolveSwaggerApiFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    walk(resolve(process.cwd(), dir), files);
  }
  return files;
}

function walk(dir: string, acc: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // directory may not exist (e.g. no controllers/ in this build)
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
}
