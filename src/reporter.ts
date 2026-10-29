import type { Reporter, TestCase, FullResult } from '@playwright/test/reporter';
import { pushToGateway, pushToOtlp, resolveOtlpEndpoint, resolveOtlpHeaders, toOtlp, toPrometheus } from './metrics.js';
import type { JourneyResult } from './types.js';

export interface OtlpOptions {
  /** Full OTLP/HTTP metrics URL. Defaults to OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, then OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics', then 'http://localhost:4318/v1/metrics'. */
  endpoint?: string;
  /** Extra headers (e.g., authentication). Merged over OTEL_EXPORTER_OTLP_HEADERS. */
  headers?: Record<string, string>;
  /** `service.name` resource attribute. Defaults to OTEL_SERVICE_NAME, then 'playwright-synthetic'. */
  serviceName?: string;
}

export interface SyntheticReporterOptions {
  /** Only tests carrying this tag are reported as journeys. Defaults to '@synthetic'. */
  tag?: string;
  /** Prometheus Pushgateway base URL. When omitted, nothing is pushed to Prometheus. */
  pushgatewayUrl?: string;
  /** Pushgateway job name. Defaults to 'playwright-synthetic'. */
  job?: string;
  /** Export to an OpenTelemetry collector over OTLP/HTTP JSON. Pass `{}` to rely on the standard OTEL_* variables. */
  otlp?: OtlpOptions;
}

class SyntheticReporter implements Reporter {
  private tests = new Map<string, TestCase>();
  private tag: string;
  private job: string;

  constructor(private options: SyntheticReporterOptions = {}) {
    this.tag = options.tag ?? '@synthetic';
    this.job = options.job ?? 'playwright-synthetic';
  }

  onTestEnd(test: TestCase): void {
    // Keyed by id: with retries the same test ends several times, the last one wins.
    if (test.tags.includes(this.tag)) this.tests.set(test.id, test);
  }

  async onEnd(_result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    const journeys = this.getJourneyResults();
    if (journeys.length === 0) return;

    console.log('\nSynthetic journeys:');
    for (const journey of journeys) {
      const status = journey.success ? 'ok' : 'FAILED';
      console.log(`  [${status}] ${journey.journey} (${journey.project || 'default'}) ${journey.durationSeconds.toFixed(2)}s, ${journey.attempts} attempt(s)`);
    }

    const timestampSeconds = Math.floor(Date.now() / 1000);
    const pushes: Array<Promise<void>> = [];

    if (this.options.pushgatewayUrl) {
      pushes.push(pushToGateway(this.options.pushgatewayUrl, this.job, toPrometheus(journeys, timestampSeconds)));
    }

    if (this.options.otlp) {
      const { endpoint, headers, serviceName } = this.options.otlp;
      pushes.push(pushToOtlp(
        resolveOtlpEndpoint(endpoint),
        resolveOtlpHeaders(headers),
        toOtlp(journeys, timestampSeconds, serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'playwright-synthetic'),
      ));
    }

    const failures = (await Promise.allSettled(pushes)).filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length === 0) return;

    // A monitor that silently fails to report looks exactly like a healthy one: fail the run instead.
    for (const failure of failures) {
      console.error(`playwright-synthetic-plugin: failed to push metrics: ${(failure.reason as Error).message}`);
    }
    return { status: 'failed' };
  }

  /** Final outcome of every tagged journey. Skipped tests carry no signal and are left out. */
  getJourneyResults(): JourneyResult[] {
    return [...this.tests.values()]
      .filter((test) => test.outcome() !== 'skipped')
      .map((test) => {
        const last = test.results[test.results.length - 1];
        return {
          journey: journeyName(test),
          project: test.parent.project()?.name ?? '',
          success: test.outcome() === 'expected' || test.outcome() === 'flaky',
          durationSeconds: (last?.duration ?? 0) / 1000,
          attempts: test.results.length,
        };
      });
  }
}

/** Describe blocks and title, without the root, project and file entries and without inline tags. */
export function journeyName(test: Pick<TestCase, 'titlePath'>): string {
  return test
    .titlePath()
    .slice(3)
    .map((part) => part.replace(/\s*@[\w-]+/g, '').trim())
    .join(' › ');
}

export default SyntheticReporter;
