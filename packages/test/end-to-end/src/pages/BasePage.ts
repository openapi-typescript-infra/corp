import type { Locator, Page } from '@playwright/test';

export function getBasePage<LocatorMap extends Record<string, string> = Record<never, string>>(
  page: Page,
  locatorMap: LocatorMap,
) {
  const closure = {
    locator(selector: string) {
      return page.locator(selector);
    },
    buildLocators<T extends Record<string, string>>(
      map: Record<keyof T, string>,
    ): Record<keyof T, Locator> {
      const result: Partial<Record<keyof T, Locator>> = {};
      for (const key of Object.keys(map || {}) as Array<keyof T>) {
        result[key] = closure.locator(map[key]);
      }
      return result as Record<keyof T, Locator>;
    },
    /**
     * Some "fake" input fields are positioned off-screen with the visible UI
     * being SVG/parent elements. Click the parent to get the intended behavior.
     */
    async checkVirtualInputField(locator: Locator) {
      const label = await locator
        .evaluateHandle((el: HTMLElement) => el.parentElement)
        .then((e) => e.asElement());
      if (!label) {
        throw new Error(`Unable to get checkbox handle for ${locator.toString()}`);
      }
      await label.scrollIntoViewIfNeeded();
      await label.click({
        position: { x: 10, y: 10 },
      });
    },
  };

  return {
    ...closure,
    el: {
      html: closure.locator('html'),
      body: closure.locator('body'),
      h1: closure.locator('h1'),
      submitButton: closure.locator('button[type="submit"]'),
      canonical: closure.locator('link[rel="canonical"]'),
      ...closure.buildLocators<LocatorMap>(locatorMap),
    },
    async setLocation(location: { latitude: number; longitude: number }) {
      await page.evaluate((l) => {
        navigator.geolocation.getCurrentPosition = (success) => {
          success({
            coords: {
              ...l,
              accuracy: 100,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON() {},
            },
            timestamp: Date.now(),
            toJSON() {},
          });
        };
      }, location);
    },
  };
}
