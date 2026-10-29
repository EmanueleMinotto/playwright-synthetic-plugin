import { jest } from '@jest/globals';
import {
  DEFAULT_OTLP_ENDPOINT,
  pushToGateway,
  pushToOtlp,
  resolveOtlpEndpoint,
  resolveOtlpHeaders,
  toOtlp,
  toPrometheus,
} from '../../src/metrics.js';

const journey = { journey: 'checkout › reaches payment', project: 'chromium', success: true, durationSeconds: 1.5, attempts: 2 };

describe('toOtlp', () => {
  it('renders one gauge per metric with service name, attributes and nanosecond timestamps', () => {
    const payload = toOtlp([journey], 1700000000, 'shop-synthetic') as any;
    const resourceMetrics = payload.resourceMetrics[0];

    expect(resourceMetrics.resource.attributes).toEqual([{ key: 'service.name', value: { stringValue: 'shop-synthetic' } }]);

    const metrics = resourceMetrics.scopeMetrics[0].metrics;
    expect(metrics.map((m: any) => m.name)).toEqual([
      'synthetic_journey_success',
      'synthetic_journey_duration_seconds',
      'synthetic_journey_attempts',
      'synthetic_journey_last_run_timestamp_seconds',
    ]);

    expect(metrics[0].gauge.dataPoints[0]).toEqual({
      attributes: [
        { key: 'journey', value: { stringValue: 'checkout › reaches payment' } },
        { key: 'project', value: { stringValue: 'chromium' } },
      ],
      timeUnixNano: '1700000000000000000',
      asInt: '1',
    });
    expect(metrics[1].unit).toBe('s');
    expect(metrics[1].gauge.dataPoints[0].asDouble).toBe(1.5);
    expect(metrics[3].gauge.dataPoints[0].asInt).toBe('1700000000');
  });
});

describe('resolveOtlpEndpoint', () => {
  it('prefers the explicit endpoint', () => {
    expect(resolveOtlpEndpoint('http://collector/v1/metrics', { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://other' })).toBe('http://collector/v1/metrics');
  });

  it('uses the metrics-specific variable as-is', () => {
    expect(resolveOtlpEndpoint(undefined, {
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://collector:4318/custom',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://other',
    })).toBe('http://collector:4318/custom');
  });

  it('appends /v1/metrics to the generic variable', () => {
    expect(resolveOtlpEndpoint(undefined, { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/' })).toBe('http://collector:4318/v1/metrics');
  });

  it('falls back to the local collector', () => {
    expect(resolveOtlpEndpoint(undefined, {})).toBe(DEFAULT_OTLP_ENDPOINT);
  });
});

describe('resolveOtlpHeaders', () => {
  it('parses and decodes the environment format, explicit headers win', () => {
    expect(resolveOtlpHeaders({ 'x-team': 'qa' }, {
      OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20abc%3D, x-team=ops,broken',
    })).toEqual({ Authorization: 'Basic abc=', 'x-team': 'qa' });
  });

  it('prefers the metrics-specific variable', () => {
    expect(resolveOtlpHeaders(undefined, {
      OTEL_EXPORTER_OTLP_METRICS_HEADERS: 'a=1',
      OTEL_EXPORTER_OTLP_HEADERS: 'b=2',
    })).toEqual({ a: '1' });
  });
});

describe('pushToOtlp', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs the JSON payload with the given headers', async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await pushToOtlp('http://collector:4318/v1/metrics', { Authorization: 'Bearer t' }, { resourceMetrics: [] });

    expect(fetchMock).toHaveBeenCalledWith('http://collector:4318/v1/metrics', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: '{"resourceMetrics":[]}',
    });
  });

  it('throws when the collector rejects the export', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 400, statusText: 'Bad Request' })) as typeof fetch;

    await expect(pushToOtlp('http://collector', {}, {})).rejects.toThrow('OTLP endpoint responded 400');
  });
});

describe('toPrometheus', () => {
  it('renders one gauge per metric with journey and project labels', () => {
    const output = toPrometheus(
      [{ journey: 'checkout › reaches payment', project: 'chromium', success: true, durationSeconds: 1.5, attempts: 2 }],
      1700000000,
    );

    expect(output).toContain('# TYPE synthetic_journey_success gauge');
    expect(output).toContain('synthetic_journey_success{journey="checkout › reaches payment",project="chromium"} 1');
    expect(output).toContain('synthetic_journey_duration_seconds{journey="checkout › reaches payment",project="chromium"} 1.5');
    expect(output).toContain('synthetic_journey_attempts{journey="checkout › reaches payment",project="chromium"} 2');
    expect(output).toContain('synthetic_journey_last_run_timestamp_seconds{journey="checkout › reaches payment",project="chromium"} 1700000000');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('escapes quotes, backslashes and newlines in labels', () => {
    const output = toPrometheus(
      [{ journey: 'say "hi"\\\nbye', project: '', success: false, durationSeconds: 0, attempts: 1 }],
      0,
    );

    expect(output).toContain('synthetic_journey_success{journey="say \\"hi\\"\\\\\\nbye",project=""} 0');
  });
});

describe('pushToGateway', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('PUTs the body to the job endpoint', async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await pushToGateway('http://gateway:9091/', 'my job', 'body\n');

    expect(fetchMock).toHaveBeenCalledWith('http://gateway:9091/metrics/job/my%20job', expect.objectContaining({ method: 'PUT', body: 'body\n' }));
  });

  it('throws when the gateway rejects the push', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 500, statusText: 'Internal Server Error' })) as typeof fetch;

    await expect(pushToGateway('http://gateway:9091', 'job', '')).rejects.toThrow('Pushgateway responded 500');
  });
});
