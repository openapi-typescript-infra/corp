import type { JTMClientSideVariables } from '../client-side-vars.ts';

export function getEnvVar<T extends JTMClientSideVariables = JTMClientSideVariables>(
  varName: keyof T,
): string;

export function getEnvVar<T extends JTMClientSideVariables>(
  varName: keyof T,
  defaultValue: string,
): string;

export function getEnvVar<T extends JTMClientSideVariables = JTMClientSideVariables>(
  varName: keyof T,
  defaultValue?: string,
): string | undefined {
  const isBrowser = typeof window !== 'undefined';
  const hasProcess = typeof process !== 'undefined';

  const value =
    (isBrowser && (window as Window & { hs?: T })?.hs?.[varName]) ||
    (hasProcess && process.env?.[varName as string]) ||
    undefined;

  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(
        `${varName.toString()} is not defined in the ${isBrowser ? 'browser' : 'server'} environment.`,
      );
    }
    return defaultValue;
  }

  return value as string;
}

export function getNodeEnv() {
  return getEnvVar('APP_ENV');
}

export function isDev() {
  return getNodeEnv() === 'development';
}

export function isProd() {
  return getNodeEnv() === 'production';
}

export function isStaging() {
  return getNodeEnv() === 'staging';
}

export function isTest() {
  return getNodeEnv() === 'test';
}
