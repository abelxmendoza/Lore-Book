import { execSync } from 'node:child_process';
import path from 'node:path';
import type { Plugin } from 'vite';

import { entriesFromCommits, type GitCommitRef } from './src/data/whatsNewFromCommits';

function readRecentGitCommits(repoRoot: string, limit = 40): GitCommitRef[] {
  try {
    const raw = execSync(`git log -${limit} --format=%cs%x09%s`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return raw
      .trim()
      .split('\n')
      .map((line) => {
        const tab = line.indexOf('\t');
        if (tab < 0) return null;
        return { date: line.slice(0, tab), subject: line.slice(tab + 1) };
      })
      .filter((row): row is GitCommitRef => Boolean(row));
  } catch {
    return [];
  }
}

/**
 * Classifies recent commits into high-level product updates at build/dev time.
 * Raw subjects never reach the client bundle.
 */
export function lorebookWhatsNewPlugin(repoRoot = path.resolve(__dirname, '../..')): Plugin {
  const entries = process.env.VITEST
    ? []
    : entriesFromCommits(readRecentGitCommits(repoRoot));
  if (entries.length > 0) {
    console.log(`📖 What's new: ${entries.length} product theme${entries.length === 1 ? '' : 's'} from recent commits`);
  }
  return {
    name: 'lorebook-whats-new',
    config: () => ({
      define: {
        __LOREBOOK_WHATS_NEW_GIT__: JSON.stringify(entries),
      },
    }),
  };
}
