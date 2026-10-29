import { test as base } from '@playwright/test';
import { DEFAULT_HEADER, findBlockingRule, missingEnv, shouldTagRequest } from './guard.js';
import type { BlockedRequest, SyntheticPluginConfig } from './types.js';

export type SyntheticOptions = {
  syntheticConfig: SyntheticPluginConfig;
};

export type SyntheticFixtures = SyntheticOptions & {
  _syntheticGuard: BlockedRequest[];
  /** Public fixture for inspecting the guardrails during a test. */
  synthetic: {
    /** Requests aborted so far because they matched a `block` rule. */
    blockedRequests(): BlockedRequest[];
  };
};

export const test = base.extend<SyntheticFixtures>({
  syntheticConfig: [{}, { option: true }],

  _syntheticGuard: [async ({ context, baseURL, syntheticConfig }, use, testInfo) => {
    const missing = missingEnv(syntheticConfig.requiredEnv ?? []);
    if (missing.length > 0) {
      throw new Error(`playwright-synthetic-plugin: missing required environment variables: ${missing.join(', ')}`);
    }

    const header = syntheticConfig.header ?? DEFAULT_HEADER;
    const rules = syntheticConfig.block ?? [];
    const blocked: BlockedRequest[] = [];

    await context.route('**/*', async (route, request) => {
      if (findBlockingRule(request.method(), request.url(), rules)) {
        blocked.push({ method: request.method(), url: request.url(), timestamp: Date.now() });
        await route.abort('blockedbyclient');
        return;
      }

      if (shouldTagRequest(request.url(), baseURL)) {
        await route.fallback({ headers: { ...request.headers(), [header.name]: header.value } });
        return;
      }

      await route.fallback();
    });

    await use(blocked);

    annotateTest(testInfo, blocked);
  }, { auto: true, box: true }],

  synthetic: [async ({ _syntheticGuard }, use) => {
    await use({
      blockedRequests: () => [..._syntheticGuard],
    });
  }, { box: true }],
});

export function annotateTest(
  testInfo: { annotations: Array<{ type: string; description?: string }> },
  blocked: BlockedRequest[],
): void {
  for (const request of blocked) {
    testInfo.annotations.push({
      type: 'synthetic-blocked',
      description: `${request.method} ${request.url}`,
    });
  }
}
