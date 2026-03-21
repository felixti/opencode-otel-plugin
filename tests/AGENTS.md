# tests/

Unit tests using `bun:test`. Run with `bun test`.

## Structure

```
tests/
├── signals/
│   ├── metrics.test.ts     # MetricInstruments creation and recording
│   └── spans.test.ts       # All 5 span helpers: names, kinds, attributes, context propagation
├── telemetry/
│   └── resources.test.ts   # Resource attribute building and creation
└── utils/
    ├── language.test.ts    # detectLanguage() extension mapping
    └── diff.test.ts        # extractFileChanges() parsing
```

## Conventions

- Mirror `src/` directory structure
- Test file names match source: `foo.ts` → `foo.test.ts`
- Use `describe`/`test`/`expect` from `bun:test`
- OTel tests use real SDK instances (no mocks for `Tracer`/`Meter`) with in-memory exporters where needed
- 37 tests, 77 assertions total
