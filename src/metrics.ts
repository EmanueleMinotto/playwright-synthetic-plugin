import type { JourneyResult } from './types.js';

interface MetricDefinition {
  name: string;
  help: string;
  unit: string;
  type: 'int' | 'double';
  value: (journey: JourneyResult, timestampSeconds: number) => number;
}

const METRICS: MetricDefinition[] = [
  { name: 'synthetic_journey_success', help: 'Whether the last run of the journey succeeded (1) or failed (0).', unit: '1', type: 'int', value: (j) => (j.success ? 1 : 0) },
  { name: 'synthetic_journey_duration_seconds', help: 'Duration of the last attempt of the journey.', unit: 's', type: 'double', value: (j) => j.durationSeconds },
  { name: 'synthetic_journey_attempts', help: 'Attempts needed by the last run, retries included.', unit: '1', type: 'int', value: (j) => j.attempts },
  { name: 'synthetic_journey_last_run_timestamp_seconds', help: 'Unix time of the last run.', unit: 's', type: 'int', value: (_j, ts) => ts },
];

export const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318/v1/metrics';
const SCOPE_NAME = 'playwright-synthetic-plugin';

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Renders journey results in the Prometheus text exposition format. */
export function toPrometheus(journeys: JourneyResult[], timestampSeconds: number): string {
  const lines: string[] = [];
  for (const metric of METRICS) {
    lines.push(`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} gauge`);
    for (const journey of journeys) {
      lines.push(`${metric.name}{journey="${escapeLabel(journey.journey)}",project="${escapeLabel(journey.project)}"} ${metric.value(journey, timestampSeconds)}`);
    }
  }

  return lines.join('\n') + '\n';
}

/** Renders journey results as an OTLP/HTTP JSON metrics export request, one gauge per metric. */
export function toOtlp(journeys: JourneyResult[], timestampSeconds: number, serviceName: string): object {
  // int64 values are strings in OTLP JSON.
  const timeUnixNano = (BigInt(timestampSeconds) * 1_000_000_000n).toString();

  return {
    resourceMetrics: [{
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
      },
      scopeMetrics: [{
        scope: { name: SCOPE_NAME },
        metrics: METRICS.map((metric) => ({
          name: metric.name,
          description: metric.help,
          unit: metric.unit,
          gauge: {
            dataPoints: journeys.map((journey) => {
              const value = metric.value(journey, timestampSeconds);
              return {
                attributes: [
                  { key: 'journey', value: { stringValue: journey.journey } },
                  { key: 'project', value: { stringValue: journey.project } },
                ],
                timeUnixNano,
                ...(metric.type === 'int' ? { asInt: String(value) } : { asDouble: value }),
              };
            }),
          },
        })),
      }],
    }],
  };
}

/** Explicit endpoint, then the standard OTEL_EXPORTER_OTLP_* variables, then the collector default. */
export function resolveOtlpEndpoint(endpoint: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  if (endpoint) return endpoint;
  if (env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT) return env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) return `${env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/+$/, '')}/v1/metrics`;
  return DEFAULT_OTLP_ENDPOINT;
}

/** Parses the `key1=value1,key2=value2` format of OTEL_EXPORTER_OTLP_HEADERS; explicit headers win. */
export function resolveOtlpHeaders(headers: Record<string, string> = {}, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const raw = env.OTEL_EXPORTER_OTLP_METRICS_HEADERS ?? env.OTEL_EXPORTER_OTLP_HEADERS ?? '';
  const fromEnv: Record<string, string> = {};

  for (const pair of raw.split(',')) {
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    fromEnv[decodeURIComponent(pair.slice(0, index).trim())] = decodeURIComponent(pair.slice(index + 1).trim());
  }

  return { ...fromEnv, ...headers };
}

async function send(url: string, init: RequestInit, target: string): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${target} responded ${response.status} ${response.statusText}`);
  }
}

export async function pushToGateway(url: string, job: string, body: string): Promise<void> {
  await send(`${url.replace(/\/+$/, '')}/metrics/job/${encodeURIComponent(job)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    body,
  }, 'Pushgateway');
}

export async function pushToOtlp(url: string, headers: Record<string, string>, payload: object): Promise<void> {
  await send(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'OTLP endpoint');
}
