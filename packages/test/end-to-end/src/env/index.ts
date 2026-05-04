import { test } from '@playwright/test';

import { development } from './development.ts';
import { local } from './local.ts';
import { production } from './production.ts';
import type { EnvConfig, Envs } from './types.ts';

const configs: Partial<Record<Envs, EnvConfig>> = {
  development,
  production,
  local,
};

function getEnv(env: string): Envs {
  if (env in configs) {
    return env as Envs;
  }
  throw new Error(`Unknown environment ${env}`);
}

const currentEnv = getEnv(process.env.JTM_TEST_ENV || 'development');

export function env(): EnvConfig {
  return configs[currentEnv] || (configs.development as EnvConfig);
}

export function isProd(): boolean {
  return currentEnv === 'production';
}

export function getEnvSettingWithDefault(name: string, defaultValue: number) {
  if (name in process.env && process.env[name]) {
    const value = Number(process.env[name]);
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  return defaultValue;
}

/**
 * Prevent a test from running against production services.
 */
export function nonProductionTest(message?: string) {
  test.skip(env().type === 'production', message || 'Test does not run on production');
}

/**
 * Skip a test as part of "typical" CI flows. Useful for early or non-critical
 * path tests that are not practical to run in all CI invocations.
 */
export function skipTestDuringTypicalCI(message?: string) {
  const shouldSkip = !!(process.env.CI && !process.env.RUN_NONCI_TESTS);
  test.skip(shouldSkip, message || 'Test does not yet run in CI');
}
