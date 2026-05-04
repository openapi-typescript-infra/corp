import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

// Paths every biome.jsonc in the repo excludes via `files.includes`. Hand
// them to biome and it exits non-zero with "No files were processed", which
// fails the hook. Filter them here so biome only sees files it'll act on.
const ALWAYS_IGNORED_PATTERNS: RegExp[] = [/(^|\/)migrations\/.*\.js$/];

function findBiomeRoot(absFile: string): string | null {
  let dir = dirname(absFile);
  while (dir.startsWith(REPO_ROOT)) {
    if (existsSync(`${dir}/biome.jsonc`) || existsSync(`${dir}/biome.json`)) {
      return dir;
    }
    if (dir === REPO_ROOT) break;
    dir = dirname(dir);
  }
  return null;
}

export default {
  '*.{js,jsx,ts,tsx,mjs,cjs,json,jsonc,css,graphql,gql}': (files: string[]) => {
    const groups = new Map<string, string[]>();
    for (const f of files) {
      const rel = relative(REPO_ROOT, f);
      if (ALWAYS_IGNORED_PATTERNS.some((re) => re.test(rel))) continue;
      const root = findBiomeRoot(f);
      if (!root) continue;
      const list = groups.get(root) ?? [];
      list.push(relative(root, f));
      groups.set(root, list);
    }
    const biomeBin = resolve(REPO_ROOT, 'node_modules/.bin/biome');
    return Array.from(groups.entries()).map(([root, rels]) => {
      const quoted = rels.map((r) => `"${r}"`).join(' ');
      return `sh -c 'cd "${root}" && "${biomeBin}" check --write --files-ignore-unknown=true ${quoted}'`;
    });
  },
};
