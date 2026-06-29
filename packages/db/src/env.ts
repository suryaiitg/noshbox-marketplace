import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';

/**
 * Load the nearest .env file, walking up from the current working directory to the
 * filesystem root. In this monorepo each script runs from its own package directory,
 * so a plain `dotenv/config` (which only looks in cwd) would miss the root .env.
 * Safe to call more than once. Existing environment variables are never overwritten.
 */
export function loadEnv(): void {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break; // reached the filesystem root without finding one
    }
    dir = parent;
  }
  // No .env found: fall back to whatever is already in the environment.
  config();
}
