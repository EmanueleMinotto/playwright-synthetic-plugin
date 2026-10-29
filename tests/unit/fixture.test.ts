import { annotateTest } from '../../src/fixture.js';

describe('annotateTest', () => {
  it('adds one synthetic-blocked annotation per blocked request', () => {
    const testInfo = { annotations: [] as Array<{ type: string; description?: string }> };

    annotateTest(testInfo, [
      { method: 'POST', url: 'https://shop.example.com/api/orders', timestamp: 1 },
      { method: 'DELETE', url: 'https://shop.example.com/api/cart', timestamp: 2 },
    ]);

    expect(testInfo.annotations).toEqual([
      { type: 'synthetic-blocked', description: 'POST https://shop.example.com/api/orders' },
      { type: 'synthetic-blocked', description: 'DELETE https://shop.example.com/api/cart' },
    ]);
  });

  it('adds nothing when no request was blocked', () => {
    const testInfo = { annotations: [] as Array<{ type: string; description?: string }> };

    annotateTest(testInfo, []);

    expect(testInfo.annotations).toEqual([]);
  });
});
