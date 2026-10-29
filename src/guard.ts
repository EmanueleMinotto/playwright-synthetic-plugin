import picomatch from 'picomatch';
import type { BlockRule, SyntheticHeader } from './types.js';

export const DEFAULT_BLOCKED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
export const DEFAULT_HEADER: SyntheticHeader = { name: 'X-Synthetic', value: 'true' };

function matchesUrl(pattern: string | RegExp, url: URL): boolean {
  if (pattern instanceof RegExp) return pattern.test(url.href);

  const isMatch = picomatch(pattern);
  return isMatch(url.pathname) || isMatch(url.host + url.pathname);
}

/** Returns the first rule that forbids this request, if any. */
export function findBlockingRule(method: string, url: string, rules: BlockRule[]): BlockRule | undefined {
  const parsed = new URL(url);
  const upperMethod = method.toUpperCase();

  return rules.find((rule) => {
    const methods = (rule.methods ?? DEFAULT_BLOCKED_METHODS).map((m) => m.toUpperCase());
    return methods.includes(upperMethod) && matchesUrl(rule.url, parsed);
  });
}

/**
 * Whether the synthetic header should be added to this request.
 * Only same-origin requests get it: a custom header on cross-origin calls triggers CORS preflights that third parties may reject.
 */
export function shouldTagRequest(url: string, baseURL: string | undefined): boolean {
  if (!baseURL) return true;
  return new URL(url).origin === new URL(baseURL).origin;
}

export function missingEnv(names: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  return names.filter((name) => !env[name]);
}
