# playwright-synthetic-plugin

Playwright plugin that turns your existing E2E journeys into production synthetic checks: run them on a schedule against the real system, with guardrails that keep them from doing damage and metrics your alerting can use.

Why this exists: [Observability Is a Testing Strategy](https://emanueleminotto.github.io/blog/observability-is-a-testing-strategy).

## Features

- **Reuse your E2E suite** — tag the journeys that matter with `@synthetic`, no rewrite into a proprietary format
- **Synthetic traffic header** — same-origin requests carry `X-Synthetic: true` so backends and analytics can recognise and discard them
- **Request blocking** — mutating requests to protected endpoints (e.g. the final checkout confirmation) are aborted before they leave the browser
- **Required environment** — journeys refuse to start if the credentials of the dedicated accounts are missing
- **OpenTelemetry and Prometheus metrics** — a reporter exports success, duration and attempts of each journey over OTLP/HTTP and/or to a Prometheus Pushgateway
- **Loud failures** — if metrics can't be pushed, the run fails instead of silently going dark

## Installation

```bash
npm install playwright-synthetic-plugin
```

## Usage

### 1. Import `test` from the plugin

```typescript
// Before
import { test, expect } from '@playwright/test';

// After
import { test } from 'playwright-synthetic-plugin';
import { expect } from '@playwright/test';
```

### 2. Tag the journeys to monitor

```typescript
test('customer reaches the payment page @synthetic', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  // ...
  await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
});
```

Five journeys that matter, not five hundred that don't.

### 3. Configure guardrails and reporter in `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';
import type { SyntheticOptions } from 'playwright-synthetic-plugin';

export default defineConfig<SyntheticOptions>({
  use: {
    baseURL: 'https://shop.example.com',
    syntheticConfig: {
      block: [
        { url: '/api/orders/**' },
        { url: '/checkout/confirm' },
        { url: 'payments.example.com/**', methods: ['POST'] },
      ],
      requiredEnv: ['SYNTHETIC_USER', 'SYNTHETIC_PASSWORD'],
    },
  },
  reporter: [
    ['list'],
    ['playwright-synthetic-plugin/reporter', {
      // Endpoint, headers and service name come from the standard OTEL_* variables
      otlp: {},
      // and/or, for a Prometheus setup without a collector:
      // pushgatewayUrl: process.env.PUSHGATEWAY_URL,
    }],
  ],
});
```

### 4. Run it on a schedule

The plugin doesn't schedule anything: any cron will do. For example, with GitHub Actions:

```yaml
name: Synthetic checks

on:
  schedule:
    - cron: '*/10 * * * *'

jobs:
  synthetic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --grep @synthetic
        env:
          SYNTHETIC_USER: ${{ secrets.SYNTHETIC_USER }}
          SYNTHETIC_PASSWORD: ${{ secrets.SYNTHETIC_PASSWORD }}
          OTEL_EXPORTER_OTLP_ENDPOINT: ${{ secrets.OTEL_EXPORTER_OTLP_ENDPOINT }}
          OTEL_EXPORTER_OTLP_HEADERS: ${{ secrets.OTEL_EXPORTER_OTLP_HEADERS }}
          OTEL_SERVICE_NAME: shop-synthetic
```

## Configuration

### `syntheticConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `header` | `{ name: string; value: string }` | `X-Synthetic: true` | Header added to requests towards the `baseURL` origin |
| `block` | `BlockRule[]` | `[]` | Requests that are aborted instead of being sent |
| `requiredEnv` | `string[]` | `[]` | Environment variables that must be set and non-empty |

### `BlockRule`

| Property | Type | Default | Description |
|---|---|---|---|
| `url` | `string \| RegExp` | — | Glob matched against `pathname` or `host + pathname` via [picomatch](https://github.com/micromatch/picomatch), or a RegExp tested against the full URL |
| `methods` | `string[]` | `POST`, `PUT`, `PATCH`, `DELETE` | HTTP methods to block |

### Reporter options

| Property | Type | Default | Description |
|---|---|---|---|
| `tag` | `string` | `@synthetic` | Only tests with this tag are reported |
| `otlp` | `OtlpOptions` | — | Export to an OpenTelemetry collector. Pass `{}` to rely on the standard `OTEL_*` variables |
| `pushgatewayUrl` | `string` | — | Prometheus Pushgateway base URL |
| `job` | `string` | `playwright-synthetic` | Pushgateway job name |

Without `otlp` and `pushgatewayUrl`, results are only printed. When both are set, both exports run; if either fails, the run fails.

### `OtlpOptions`

| Property | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, then `OTEL_EXPORTER_OTLP_ENDPOINT` + `/v1/metrics`, then `http://localhost:4318/v1/metrics` | Full OTLP/HTTP metrics URL |
| `headers` | `Record<string, string>` | `OTEL_EXPORTER_OTLP_METRICS_HEADERS` or `OTEL_EXPORTER_OTLP_HEADERS` | Extra headers, e.g. authentication. Explicit values win over the environment |
| `serviceName` | `string` | `OTEL_SERVICE_NAME`, then `playwright-synthetic` | `service.name` resource attribute |

Metrics are sent as OTLP/HTTP JSON, so no OpenTelemetry SDK is pulled in.

## Output

### Metrics

The same four gauges are exported to both backends. Each journey is labelled (Prometheus) or attributed (OpenTelemetry) with `journey` (describe blocks and title, tags stripped) and `project`:

| Metric | Description |
|---|---|
| `synthetic_journey_success` | `1` if the last run passed (flaky counts as passed), `0` otherwise |
| `synthetic_journey_duration_seconds` | Duration of the last attempt |
| `synthetic_journey_attempts` | Attempts needed, retries included — a journey that needs retries is a signal too |
| `synthetic_journey_last_run_timestamp_seconds` | Unix time of the run — alert when it gets old, or a dead scheduler looks like a healthy system |

SLOs and burn-rate alerts are meant to be computed on top of these metrics, in your metrics backend.

### Annotations

Every blocked request adds a `synthetic-blocked` annotation (`METHOD url`) to the test, visible in Playwright's HTML reporter.

### Fixture

The `synthetic` fixture exposes `blockedRequests()` to assert on the guardrails during a test.

## Limitations

- **Only browser traffic is guarded.** The header and the blocking rules work through `context.route()`, so they don't apply to the `request` fixture (`APIRequestContext`), to requests made by service workers, or to calls your backend makes on its own.
- **Routing disables the HTTP cache**, as for any Playwright test using `route()`: timings can be slightly worse than for a real user.
- **OTLP over HTTP with JSON only.** gRPC and protobuf encodings aren't supported; point the plugin at a collector or backend that accepts `http/json`.
- **Blocking is a safety net, not a design.** Journeys should still stop before irreversible steps on their own; the rules catch the ones that forget.

## License

MIT
