#!/usr/bin/env node
/* eslint-disable no-console */
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { fromBaseShortUuid, fromExternalID, toBareShortUuid, toExternalID } from './codec.ts';
import { ExternalIDType } from './registry.ts';

const uuidRegex = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

class ExpectedError extends Error {
  expected = true;
}

const idTypes: Record<string, string> = {};
for (const [key, value] of Object.entries(ExternalIDType)) {
  idTypes[key.toLowerCase()] = value.toLowerCase();
}

const idValues = Object.values<string>(ExternalIDType);

function validateType(type: unknown): undefined | string {
  if (typeof type !== 'string') {
    return;
  }

  const normalizedType = type.trim().toLowerCase();
  if (normalizedType in idTypes) {
    return idTypes[normalizedType];
  } else if (idValues.includes(normalizedType)) {
    return normalizedType;
  }
  return;
}

function isUuid(input: string): boolean {
  return uuidRegex.test(input);
}

function convertId(input: string, type?: string) {
  if (isUuid(input)) {
    if (type) {
      return toExternalID(type as ExternalIDType, input);
    }
    return toBareShortUuid(input);
  } else {
    if (input.includes('_')) {
      return fromExternalID(input);
    }
    return fromBaseShortUuid(input);
  }
}

const config: ParseArgsConfig = {
  options: {
    help: { type: 'boolean', short: 'h' },
    quiet: { type: 'boolean', short: 'q' },
    type: { type: 'string', short: 't' },
    ['list-types']: { type: 'boolean' },
  },
  allowPositionals: true,
};

function maybeErrorLog(...args: unknown[]) {
  if (!values.quiet) {
    console.error(...args);
  }
}

const args = parseArgs(config);
const { values } = args;
let { positionals } = args;

async function main() {
  if (!process.stdin.isTTY) {
    let stdinData = '';
    process.stdin.setEncoding('utf8');

    for await (const chunk of process.stdin) {
      stdinData += chunk;
    }

    const stdinLines = stdinData
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    positionals = [...positionals, ...stdinLines];
  }

  const validatedType = validateType(values.type);

  if (values['list-types'] && !values.help) {
    Object.entries(ExternalIDType).forEach(([key, value]) => {
      console.log(`  ${value}\t${key}`);
    });
    return;
  }

  if (values.help || positionals.length === 0) {
    if (!values.help) {
      process.exitCode = 1;
      maybeErrorLog('Error: no IDs provided\n');
    }

    console.log('Usage: external-id [options] [id ...] ');
    console.log('Options:');
    console.log('  -h, --help         Print this help message');
    console.log('  -t, --type         The type of ID when encoding (unused when decoding)');
    console.log('      --list-types   List all known ID types');
    console.log('  -q, --quiet        Suppress error logs');

    return;
  }

  if (typeof values.type === 'string' && !validatedType) {
    throw new ExpectedError(`Error: unknown type (${values.type})`);
  }

  if (positionals.length === 1) {
    try {
      console.log(convertId(positionals[0], validatedType));
    } catch {
      throw new ExpectedError(`Error: invalid id (${positionals[0]})`);
    }

    return;
  }

  let errored = false;
  for (const id of positionals) {
    try {
      console.log(`${id}=${convertId(id, validatedType)}`);
    } catch {
      errored = true;
      maybeErrorLog(`Error: invalid id (${id})`);
    }
  }

  if (errored) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (!(error instanceof ExpectedError)) {
    console.error('Unexpected error:', error);
  } else {
    maybeErrorLog(error.message);
  }
  process.exitCode = 1;
});
