import { expect, test } from '@playwright/test';

import { getBaseWebPage } from '#src/pages/web/BaseWebPage.ts';
import { VISIBLE_QUICKLY } from '#src/waits.ts';

test('@smoke web app loads', async ({ page }) => {
  const home = getBaseWebPage(page, '/', {});
  await home.goto();
  await home.el.body.waitFor(VISIBLE_QUICKLY);
  await expect(page).toHaveTitle(/.+/);
});
