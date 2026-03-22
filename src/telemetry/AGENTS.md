# telemetry/

OTel SDK initialization — resource creation, provider setup, and graceful shutdown/flush.

## Files

### `resources.ts` — Resource Creation (31 lines)

- `buildResourceAttributes(input: ResourceInput)` → returns a plain `Record<string, string>` of resource attributes. Uses `ATTR_SERVICE_NAME` and `ATTR_HOST_NAME` from semantic conventions.
- `createResource(input: ResourceInput)` → wraps `buildResourceAttributes` with `resourceFromAttributes()` (OTel SDK v2 API).

Resource attributes: `service.name` ("opencode"), `host.name`, `enduser.id`, `opencode.project.name`, `vcs.repository.url.full`, `vcs.repository.ref.name`, `opencode.worktree`, `opencode.directory`.

**Note**: Resource is immutable after creation. Dynamic values like `service.version` and branch updates are set as span attributes on active spans, not on the resource.

### `provider.ts` — Provider Initialization (30 lines)

`initProviders(resource)` creates and registers:

- `BasicTracerProvider` with `BatchSpanProcessor` → `OTLPTraceExporter` (OTLP/HTTP)
- `MeterProvider` with `PeriodicExportingMetricReader` (30s interval) → `OTLPMetricExporter`

Both are registered as global providers via `trace.setGlobalTracerProvider()` and `metrics.setGlobalMeterProvider()`.

Returns `Providers` type `{ tracerProvider, meterProvider }` for shutdown/flush use.

**SDK v2 note**: `spanProcessors` is passed in the `BasicTracerProvider` constructor options, not registered separately.

### `shutdown.ts` — Shutdown & Flush (23 lines)

- `shutdownProviders(providers)` — calls `.shutdown()` on both providers via `Promise.allSettled()`. Used on `server.instance.disposed`.
- `flushProviders(providers)` — calls `.forceFlush()` on both providers. Used on `session.idle`.

Both functions swallow errors — OTel shutdown/flush failures must never propagate to the host. Uses `withTimeout` wrapper to race promises against a deadline; timers are `.unref()`'d where available.

### `index.ts` — Barrel Export (5 lines)

Re-exports `createResource`, `buildResourceAttributes`, `initProviders`, `Providers`, `shutdownProviders`, `flushProviders`.
