import type { Locator, Page, Response } from '@playwright/test';
import { test } from '@playwright/test';

import { env, getEnvSettingWithDefault } from '#src/env/index.ts';
import { api } from '#src/network.ts';

type WaitArgs = Parameters<Locator['waitFor']>[0];

function ciAdjustedTimeout(timeout: number) {
  const timeMultiplier = getEnvSettingWithDefault('TIME_MULTIPLE', process.env.CI ? 10 : 4);
  return timeout * timeMultiplier;
}

export const QUICKLY: { timeout: number } = {
  timeout: ciAdjustedTimeout(env().timeBase.QUICK),
};

export const VISIBLE_QUICKLY: WaitArgs = {
  ...QUICKLY,
  state: 'visible',
};

export const SLOWLY: { timeout: number } = {
  timeout: ciAdjustedTimeout(env().timeBase.SLOW),
};

export const VISIBLE_SLOWLY: WaitArgs = {
  ...SLOWLY,
  state: 'visible',
};

export const GLACIAL: { timeout: number } = {
  timeout: ciAdjustedTimeout(env().timeBase.GLACIAL),
};

export async function waitUntilTruthy<T>(
  fn: () => Promise<T>,
  interval = 50,
  timeout = env().timeBase.SLOW,
) {
  const maxWait = Date.now() + timeout;
  while (Date.now() < maxWait) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`waitUntilTrue timed out after ${timeout}ms`);
}

export async function waitForUrlToChange(page: Page, options: { timeout: number } = SLOWLY) {
  const urlToStart = page.url();
  const urlChange = new Promise((resolve) => {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && page.url() !== urlToStart) {
        resolve(undefined);
      }
    });
  });
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout after waiting ${options.timeout}ms for URL to change`)),
      options.timeout,
    ),
  );
  await Promise.race([urlChange, timeoutPromise]);
}

export function longTest(options?: Partial<Parameters<typeof test.describe.configure>[0]>) {
  test.describe.configure({
    ...options,
    timeout: 120000,
  });
}

/**
 * Wait for the first locator that matches and return its index.
 */
export async function waitForAnyLocator(
  locators: Locator[],
  options: WaitArgs = VISIBLE_QUICKLY,
): Promise<number> {
  const promises = locators.map((locator, index) => locator.waitFor(options).then(() => index));
  return Promise.race(promises);
}

export async function waitForAllElementsToDisappear(locator: Locator, options = QUICKLY) {
  while ((await locator.count()) > 0) {
    await locator.first().waitFor({
      ...options,
      state: 'detached',
    });
  }
}

export async function waitForGqlQuery(
  page: Page,
  operationName: string,
  options: Parameters<Page['waitForResponse']>[1],
  interceptor?: (response: Response) => Promise<void>,
) {
  return page.waitForResponse(async (response) => {
    if (response.url().startsWith(api('/graphql'))) {
      const op = response.request().postDataJSON().operationName;
      const match = op === operationName;
      if (match && interceptor) {
        await interceptor(response);
      }
      return match;
    }
    return false;
  }, options);
}

/**
 * Pair a goto-style method with a waitForContent so the wait can be set up
 * before the navigation resolves (otherwise some events can be missed).
 */
export function gotoMethods<T extends unknown[], R>(
  gotoMethod: (...args: T) => Promise<R>,
  waitMethod: (options?: WaitArgs) => Promise<unknown>,
) {
  return {
    goto: gotoMethod,
    waitForContent: waitMethod,
    async gotoAndWaitForContent(...args: T) {
      const go = gotoMethod(...args);
      const waiter = waitMethod();
      const result = await go;
      await waiter;
      return result;
    },
  };
}
