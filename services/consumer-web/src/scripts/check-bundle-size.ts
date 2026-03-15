#!/usr/bin/env node

/**
 * Bundle size budget checker for Next.js builds.
 *
 * Reads the build output in the dist directory and checks JS bundle sizes
 * against budgets configured in package.json under "bundleBudgets".
 *
 * Usage:
 *   node src/scripts/check-bundle-size.ts [--json]
 *
 * Configuration (package.json):
 *   "bundleBudgets": {
 *     "page": "200kb",       Max size for any individual page bundle
 *     "total": "750kb",      Max total size of all first-load JS
 *     "shared": "500kb"      Max size of the shared framework chunk
 *   }
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = 'private';
const DEFAULT_BUDGETS: Record<string, string> = {
  page: '200kb',
  total: '750kb',
  shared: '500kb',
};

interface ChunkInfo {
  file: string;
  size: number;
  label: string;
}

interface PageEntry {
  route: string;
  size: number;
}

function parseSize(str: string): number {
  const match = str.match(/^([\d.]+)\s*(kb|mb|b)$/i);
  if (!match) {
    throw new Error(`Invalid size format: "${str}"`);
  }
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'b') {
    return value;
  }
  if (unit === 'kb') {
    return value * 1024;
  }
  if (unit === 'mb') {
    return value * 1024 * 1024;
  }
  return value;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} kB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

function loadBudgets(): Record<string, string> {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return { ...DEFAULT_BUDGETS, ...pkg.bundleBudgets };
}

function collectChunkSizes(): ChunkInfo[] {
  const staticDir = path.join(DIST_DIR, 'static');
  if (!fs.existsSync(staticDir)) {
    // eslint-disable-next-line no-console
    console.error(`Build output not found at ${DIST_DIR}/. Run "next build" first.`);
    process.exit(1);
  }

  const chunks: ChunkInfo[] = [];

  function walk(dir: string, label: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, label || entry.name);
      } else if (entry.name.endsWith('.js')) {
        const stat = fs.statSync(full);
        chunks.push({
          file: path.relative(DIST_DIR, full),
          size: stat.size,
          label: label || 'other',
        });
      }
    }
  }

  walk(staticDir, '');
  return chunks;
}

function collectPageSizes(): Record<string, number> | null {
  const manifestPath = path.join(DIST_DIR, 'build-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    pages: Record<string, string[]>;
  };
  const pages: Record<string, number> = {};

  for (const [route, files] of Object.entries(manifest.pages || {})) {
    let total = 0;
    for (const file of files as string[]) {
      if (!file.endsWith('.js')) {
        continue;
      }
      const full = path.join(DIST_DIR, file);
      if (fs.existsSync(full)) {
        total += fs.statSync(full).size;
      }
    }
    pages[route] = total;
  }

  return pages;
}

function run() {
  const jsonMode = process.argv.includes('--json');
  const budgets = loadBudgets();
  const chunks = collectChunkSizes();
  const pages = collectPageSizes();

  const pageBudget = parseSize(budgets.page);
  const totalBudget = parseSize(budgets.total);
  const sharedBudget = parseSize(budgets.shared);

  const violations: string[] = [];
  const results: { pages: PageEntry[]; totalSize: number } = {
    pages: [],
    totalSize: 0,
  };

  // Check total JS size
  const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
  results.totalSize = totalSize;

  if (totalSize > totalBudget) {
    violations.push(`Total JS (${formatSize(totalSize)}) exceeds budget of ${budgets.total}`);
  }

  // Check shared/framework chunks
  const sharedChunks = chunks.filter((c) => c.label === 'chunks' || c.file.includes('framework'));
  const sharedSize = sharedChunks.reduce((sum, c) => sum + c.size, 0);
  if (sharedSize > sharedBudget) {
    violations.push(`Shared JS (${formatSize(sharedSize)}) exceeds budget of ${budgets.shared}`);
  }

  // Check per-page sizes
  if (pages) {
    for (const [route, size] of Object.entries(pages)) {
      results.pages.push({ route, size });
      if (size > pageBudget) {
        violations.push(`Page ${route} (${formatSize(size)}) exceeds budget of ${budgets.page}`);
      }
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify({ ...results, violations }, null, 2));
    process.exit(violations.length > 0 ? 1 : 0);
  }

  // Pretty output
  console.log('\nBundle Size Report\n');
  console.log(`  Total JS:    ${formatSize(totalSize).padStart(12)}  (budget: ${budgets.total})`);
  console.log(`  Shared JS:   ${formatSize(sharedSize).padStart(12)}  (budget: ${budgets.shared})`);

  if (pages && Object.keys(pages).length > 0) {
    console.log('\n  Pages:');
    const sorted = Object.entries(pages).sort((a, b) => b[1] - a[1]);
    for (const [route, size] of sorted) {
      const over = size > pageBudget ? '  OVER BUDGET' : '';
      console.log(`    ${route.padEnd(40)} ${formatSize(size).padStart(12)}${over}`);
    }
  }

  if (violations.length > 0) {
    console.log(`\n${violations.length} budget violation(s):\n`);
    for (const v of violations) {
      console.log(`  - ${v}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('\nAll bundles within budget.\n');
    process.exit(0);
  }
}

run();
