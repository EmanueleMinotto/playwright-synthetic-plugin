export interface BlockRule {
  /** Glob matched against `pathname` or `host + pathname` (e.g., '/api/orders/**'), or a RegExp tested against the full URL */
  url: string | RegExp;
  /** HTTP methods to block. Defaults to POST, PUT, PATCH and DELETE. */
  methods?: string[];
}

export interface SyntheticHeader {
  name: string;
  value: string;
}

export interface SyntheticPluginConfig {
  /** Header added to requests towards the `baseURL` origin, so backends can recognise synthetic traffic. Defaults to `X-Synthetic: true`. */
  header?: SyntheticHeader;
  /** Requests that must never reach production (e.g., the final checkout confirmation) */
  block?: BlockRule[];
  /** Environment variables that must be set before any journey runs (e.g., dedicated account credentials) */
  requiredEnv?: string[];
}

export interface BlockedRequest {
  method: string;
  url: string;
  timestamp: number;
}

export interface JourneyResult {
  journey: string;
  project: string;
  success: boolean;
  durationSeconds: number;
  attempts: number;
}
