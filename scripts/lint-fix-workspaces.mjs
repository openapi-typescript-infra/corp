#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

function readWorkspaces() {
  const output = execFileSync('yarn', ['workspaces', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((workspace) => workspace.location !== '.');
}

function splitArgs(command) {
  return command.trim().split(/\s+/);
}

function fixCommand(command) {
  const args = splitArgs(command);
  if (args[0] === 'biome' && args[1] === 'check') {
    return [
      ...args,
      ...(!args.includes('--write') ? ['--write'] : []),
      ...(!args.includes('--unsafe') ? ['--unsafe'] : []),
    ];
  }
  if (args[0] === 'eslint') {
    return args.includes('--fix') ? args : [...args, '--fix'];
  }
  return null;
}

let failed = false;

for (const workspace of readWorkspaces()) {
  const packageJsonPath = resolve(repoRoot, workspace.location, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const lintScript = packageJson.scripts?.lint;
  if (!lintScript) continue;

  const commands = lintScript
    .split('&&')
    .map(fixCommand)
    .filter(Boolean);
  if (commands.length === 0) continue;

  for (const command of commands) {
    console.log(`\n${workspace.name}: ${command.join(' ')}`);
    const result = spawnSync('yarn', ['exec', ...command], {
      cwd: resolve(repoRoot, workspace.location),
      stdio: 'inherit',
      shell: false,
    });
    if (result.status !== 0) {
      if (result.error) {
        console.error(`${workspace.name}: ${result.error.message}`);
      }
      failed = true;
      break;
    }
  }
}

if (failed) {
  process.exitCode = 1;
}
