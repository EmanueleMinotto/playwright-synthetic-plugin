import { findBlockingRule, missingEnv, shouldTagRequest } from '../../src/guard.js';

describe('findBlockingRule', () => {
  const rules = [{ url: '/api/orders/**' }, { url: 'payments.example.com/**', methods: ['GET'] }];

  it('blocks mutating methods by default', () => {
    expect(findBlockingRule('POST', 'https://shop.example.com/api/orders/confirm', rules)).toBe(rules[0]);
    expect(findBlockingRule('delete', 'https://shop.example.com/api/orders/42', rules)).toBe(rules[0]);
  });

  it('lets read-only methods through by default', () => {
    expect(findBlockingRule('GET', 'https://shop.example.com/api/orders/42', rules)).toBeUndefined();
  });

  it('matches host + pathname patterns with explicit methods', () => {
    expect(findBlockingRule('GET', 'https://payments.example.com/session', rules)).toBe(rules[1]);
    expect(findBlockingRule('POST', 'https://payments.example.com/session', rules)).toBeUndefined();
  });

  it('ignores the query string when matching globs', () => {
    expect(findBlockingRule('POST', 'https://shop.example.com/api/orders/confirm?retry=1', rules)).toBe(rules[0]);
  });

  it('tests RegExp rules against the full URL', () => {
    const regexRules = [{ url: /\/checkout\/confirm$/ }];
    expect(findBlockingRule('PUT', 'https://shop.example.com/checkout/confirm', regexRules)).toBe(regexRules[0]);
  });

  it('blocks nothing without rules', () => {
    expect(findBlockingRule('POST', 'https://shop.example.com/api/orders', [])).toBeUndefined();
  });
});

describe('shouldTagRequest', () => {
  it('tags only same-origin requests when a baseURL is set', () => {
    expect(shouldTagRequest('https://shop.example.com/api/products', 'https://shop.example.com')).toBe(true);
    expect(shouldTagRequest('https://cdn.thirdparty.com/lib.js', 'https://shop.example.com')).toBe(false);
  });

  it('tags everything without a baseURL', () => {
    expect(shouldTagRequest('https://cdn.thirdparty.com/lib.js', undefined)).toBe(true);
  });
});

describe('missingEnv', () => {
  it('returns unset and empty variables', () => {
    expect(missingEnv(['USER', 'PASSWORD', 'TOKEN'], { USER: 'bot', PASSWORD: '' })).toEqual(['PASSWORD', 'TOKEN']);
  });
});
