# tests/

Unit tests using `bun:test`. Run with `bun test`.

## Structure

```
tests/
├── hooks/
│   └── tool-execute.test.ts  # code.language, file.changes metric, span chaining on tool spans
├── signals/
│   ├── metrics.test.ts       # MetricInstruments creation and recording
│   └── spans.test.ts         # All 4 span helpers: names, kinds, attributes, context propagation
├── telemetry/
│   └── resources.test.ts     # Resource attribute building and creation
└── utils/
    └── language.test.ts      # detectLanguage() extension mapping
```

## Conventions

- Mirror `src/` directory structure
- Test file names match source: `foo.ts` → `foo.test.ts`
- Use `describe`/`test`/`expect` from `bun:test`
- OTel tests use real SDK instances (no mocks for `Tracer`/`Meter`) with in-memory exporters where needed
- `hooks/` tests use their own `BasicTracerProvider` + `InMemorySpanExporter` (isolated from `spans.test.ts`)
- 55 tests, 96 assertions total

## Test Patterns

- **Span assertions**: create `BasicTracerProvider` + `SimpleSpanProcessor` + `InMemorySpanExporter` → call code under test → `exporter.getFinishedSpans()` to inspect names, attributes, parent IDs
- **Metric assertions**: use small in-file spy objects (`createSpyCounter()` with `add()` that records calls) rather than full metric SDK exporters
- **Mock state**: `createMockState()` returns `PluginState`-shaped object with empty maps and `gitReady = Promise.resolve()` to avoid real git calls
- **No mocking frameworks**: no jest/vitest/sinon — use explicit small fakes defined inline per test file
- **Reset in `beforeEach`**: exporters reset and state rebuilt per test for isolation
