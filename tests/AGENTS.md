# tests/

Unit tests using `bun:test`. Run with `bun test`.

## Structure

```
tests/
├── hooks/
│   └── tool-execute.test.ts  # code.language attribute + opencode.file.changes metric on tool spans
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
- 48 tests, 84 assertions total
