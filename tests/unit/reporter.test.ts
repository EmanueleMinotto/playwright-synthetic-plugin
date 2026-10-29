import { jest } from '@jest/globals';
import SyntheticReporter, { journeyName } from '../../src/reporter.js';
import type { TestCase, FullResult } from '@playwright/test/reporter';

function fakeTest(options: {
  id: string;
  titlePath: string[];
  tags?: string[];
  outcome?: ReturnType<TestCase['outcome']>;
  durations?: number[];
  project?: string;
}): TestCase {
  return {
    id: options.id,
    tags: options.tags ?? ['@synthetic'],
    titlePath: () => options.titlePath,
    outcome: () => options.outcome ?? 'expected',
    results: (options.durations ?? [1000]).map((duration) => ({ duration })),
    parent: { project: () => ({ name: options.project ?? 'chromium' }) },
  } as unknown as TestCase;
}

const fakeFullResult = {} as FullResult;

describe('journeyName', () => {
  it('drops root, project and file, and strips inline tags', () => {
    expect(journeyName({ titlePath: () => ['', 'chromium', 'checkout.spec.ts', 'checkout', 'reaches payment @synthetic'] }))
      .toBe('checkout › reaches payment');
  });
});

describe('SyntheticReporter', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it('reports only tests carrying the tag', () => {
    const reporter = new SyntheticReporter();
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', 'chromium', 'f.ts', 'tagged'] }));
    reporter.onTestEnd(fakeTest({ id: 'b', titlePath: ['', 'chromium', 'f.ts', 'untagged'], tags: [] }));

    expect(reporter.getJourneyResults().map((j) => j.journey)).toEqual(['tagged']);
  });

  it('supports a custom tag', () => {
    const reporter = new SyntheticReporter({ tag: '@prod' });
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', '', 'f.ts', 'prod check'], tags: ['@prod'] }));

    expect(reporter.getJourneyResults()).toHaveLength(1);
  });

  it('counts flaky as success, records attempts and last attempt duration', () => {
    const reporter = new SyntheticReporter();
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', 'chromium', 'f.ts', 'flaky'], outcome: 'flaky', durations: [3000, 1500] }));
    reporter.onTestEnd(fakeTest({ id: 'b', titlePath: ['', 'chromium', 'f.ts', 'broken'], outcome: 'unexpected' }));

    expect(reporter.getJourneyResults()).toEqual([
      { journey: 'flaky', project: 'chromium', success: true, durationSeconds: 1.5, attempts: 2 },
      { journey: 'broken', project: 'chromium', success: false, durationSeconds: 1, attempts: 1 },
    ]);
  });

  it('leaves skipped tests out', () => {
    const reporter = new SyntheticReporter();
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', '', 'f.ts', 'skipped'], outcome: 'skipped' }));

    expect(reporter.getJourneyResults()).toEqual([]);
  });

  it('pushes metrics when a Pushgateway is configured', async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const reporter = new SyntheticReporter({ pushgatewayUrl: 'http://gateway:9091' });
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', 'chromium', 'f.ts', 'journey'] }));

    await expect(reporter.onEnd(fakeFullResult)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://gateway:9091/metrics/job/playwright-synthetic', expect.anything());
  });

  it('fails the run when the push fails', async () => {
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;

    const reporter = new SyntheticReporter({ pushgatewayUrl: 'http://gateway:9091' });
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', 'chromium', 'f.ts', 'journey'] }));

    await expect(reporter.onEnd(fakeFullResult)).resolves.toEqual({ status: 'failed' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  it('exports to both Pushgateway and OTLP when configured', async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const reporter = new SyntheticReporter({
      pushgatewayUrl: 'http://gateway:9091',
      otlp: { endpoint: 'http://collector:4318/v1/metrics', serviceName: 'shop' },
    });
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', 'chromium', 'f.ts', 'journey'] }));

    await expect(reporter.onEnd(fakeFullResult)).resolves.toBeUndefined();
    const urls = fetchMock.mock.calls.map((call) => (call as unknown[])[0]);
    expect(urls).toEqual(['http://gateway:9091/metrics/job/playwright-synthetic', 'http://collector:4318/v1/metrics']);
  });

  it('fails the run when one of the exports fails, without skipping the other', async () => {
    const fetchMock = jest.fn(async (url: string) => (url.includes('collector')
      ? new Response(null, { status: 503, statusText: 'Service Unavailable' })
      : new Response(null, { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const reporter = new SyntheticReporter({
      pushgatewayUrl: 'http://gateway:9091',
      otlp: { endpoint: 'http://collector:4318/v1/metrics' },
    });
    reporter.onTestEnd(fakeTest({ id: 'a', titlePath: ['', 'chromium', 'f.ts', 'journey'] }));

    await expect(reporter.onEnd(fakeFullResult)).resolves.toEqual({ status: 'failed' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('OTLP endpoint responded 503'));
  });

  it('does nothing without journeys', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const reporter = new SyntheticReporter({ pushgatewayUrl: 'http://gateway:9091' });
    await reporter.onEnd(fakeFullResult);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
