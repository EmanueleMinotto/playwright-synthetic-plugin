import { expect } from '@playwright/test';
import { test } from '../../src/index.js';

test.describe('shop', () => {
  test('adds the synthetic header to same-origin requests @synthetic', async ({ page }) => {
    await page.goto('/');

    const response = page.waitForResponse('**/api/products');
    await page.getByRole('button', { name: 'Load products' }).click();

    expect(await (await response).json()).toMatchObject({ synthetic: 'true' });
  });

  test('blocks mutating requests to protected endpoints @synthetic', async ({ page, synthetic, request }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.locator('#status')).toHaveText('Order failed');

    expect(synthetic.blockedRequests()).toEqual([
      expect.objectContaining({ method: 'POST', url: expect.stringMatching(/\/api\/orders$/) }),
    ]);

    // The `request` fixture bypasses page routing, so it can ask the server what really arrived.
    const { count } = await (await request.get('/api/orders/count')).json();
    expect(count).toBe(0);
  });
});
