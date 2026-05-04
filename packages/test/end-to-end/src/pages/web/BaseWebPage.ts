import type { Page } from '@playwright/test';
import { webUrl } from '#src/network.ts';
import { getBasePage } from '#src/pages/BasePage.ts';

export function getBaseWebPage<LocatorMap extends Record<string, string>>(
  page: Page,
  path: string,
  locatorMap: LocatorMap,
) {
  const base = getBasePage(page, locatorMap);
  return {
    ...base,
    async goto() {
      return page.goto(webUrl(path));
    },
  };
}
