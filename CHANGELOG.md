# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added
- `test` fixture with `syntheticConfig` option: synthetic traffic header on same-origin requests,
  `block` rules that abort mutating requests to protected endpoints, and `requiredEnv` checks.
- `synthetic` fixture exposing `blockedRequests()`, and `synthetic-blocked` test annotations.
- `playwright-synthetic-plugin/reporter`: per-journey console summary, with metrics exported to an
  OpenTelemetry collector over OTLP/HTTP JSON (honouring the standard `OTEL_*` variables) and/or to a
  Prometheus Pushgateway; the run fails if any export fails.
