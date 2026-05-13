#!/usr/bin/env node
// Build pipeline for monorepo library packages whose source uses
// .ts extensions and #src/* subpath imports. Runs:
//   1. tsgo / tsc -p tsconfig.build.json   (emits; TS2877 expected — tsc-alias
//                                           fixes those after emit. Real errors
//                                           still fail the build.)
//   2. tsc-alias                           (rewrites #src/ aliases to relative
//                                           paths and .ts/.tsx → .js/.jsx via
//                                           the shared replacer)
//
// `rewriteRelativeImportExtensions` in tsconfig handles .ts→.js for *relative*
// imports, but not for path-aliased ones like `#src/foo`, and not for the
// alias itself — so the post-pass is required whenever a package uses #src/*.
// Packages without #src/* can just run `tsgo -p tsconfig.build.json` directly.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cwdRequire = createRequire(path.join(process.cwd(), 'package.json'));
const project = process.argv[2] || 'tsconfig.build.json';

function resolveCompiler(): string {
  if (process.env.BUILD_COMPILER) return process.env.BUILD_COMPILER;
  // yarn berry scopes binaries to the package's own deps, so check this
  // package's manifest rather than the hoisted root.
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  return all['@typescript/native-preview'] ? 'tsgo' : 'tsc';
}

function stripTs2877(out: string): string {
  // tsgo/tsc emit either "path(L,C): error TSxxxx: …" (single line) or the
  // pretty multi-line format: "path:L:C - error TSxxxx: …\n\n  N code\n   ~~~\n\n".
  // Strip both forms when the diagnostic is TS2877. Code/caret indent varies,
  // so consume up through the next blank line (or EOF) after a pretty header.
  return out
    .replace(/^[^\n]*error TS2877:[^\n]*\n(?:[^\n]*\n)*?[ \t]*\n/gm, '')
    .replace(/^[^\n]*\([0-9]+,[0-9]+\): error TS2877:[^\n]*\n/gm, '');
}

const compiler = resolveCompiler();
const compile = spawnSync('yarn', [compiler, '-p', project], { encoding: 'utf8' });

const filtered = stripTs2877(compile.stdout || '') + stripTs2877(compile.stderr || '');
if (filtered.trim()) process.stderr.write(filtered);

const tscAliasBin = cwdRequire.resolve('tsc-alias/dist/bin/index.js');
const replacer = path.join(here, '..', 'ts-extension-replacer.cjs');

const aliasResult = spawnSync(
  process.execPath,
  [tscAliasBin, '--project', project, '-r', replacer],
  { stdio: 'inherit' },
);

if (aliasResult.status !== 0) process.exit(aliasResult.status ?? 1);

// Fail if the compiler reported anything other than TS2877.
if (filtered.trim()) process.exit(1);
