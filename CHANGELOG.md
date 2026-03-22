## [0.6.0](https://github.com/felixti/opencode-otel-plugin/compare/v0.5.1...v0.6.0) (2026-03-22)

### Features

* **hooks:** wire VCS operation detection and metric recording ([53b6b8b](https://github.com/felixti/opencode-otel-plugin/commit/53b6b8bf0d9bfd3d0dbf444547817e943f8a5b01))
* **signals:** add vcsOperations counter to MetricInstruments ([d029bf2](https://github.com/felixti/opencode-otel-plugin/commit/d029bf20f809ebd43bf19f8ed8b79d036d0edcad))
* **utils:** add VCS operation detection for git commit ([2a98d7a](https://github.com/felixti/opencode-otel-plugin/commit/2a98d7a9dbfdbabcc98ec0a16a8e33f246d9f066))

## [0.5.1](https://github.com/felixti/opencode-otel-plugin/compare/v0.5.0...v0.5.1) (2026-03-22)

### Bug Fixes

* switch OTLP exporters from JSON to protobuf for Dynatrace compatibility ([46f0aa9](https://github.com/felixti/opencode-otel-plugin/commit/46f0aa9ceef9d348bfe3597820d4159aea5d7971))

## [0.5.0](https://github.com/felixti/opencode-otel-plugin/compare/v0.4.2...v0.5.0) (2026-03-22)

### Features

* **hooks:** add file change counts as span attributes on execute_tool spans ([5768eeb](https://github.com/felixti/opencode-otel-plugin/commit/5768eeb3e666c3af79a13b8fccca57e7448b8923))

## [0.4.2](https://github.com/felixti/opencode-otel-plugin/compare/v0.4.1...v0.4.2) (2026-03-22)

### Bug Fixes

* **hooks:** support code.language and file changes for write and apply_patch tools ([a37b8dd](https://github.com/felixti/opencode-otel-plugin/commit/a37b8dd2553a7f5edad949ba18426933cf851d0f))

## [0.4.1](https://github.com/felixti/opencode-otel-plugin/compare/v0.4.0...v0.4.1) (2026-03-22)

### Bug Fixes

* **ci:** add Node.js 22 setup for semantic-release compatibility ([cf55420](https://github.com/felixti/opencode-otel-plugin/commit/cf55420cb350f53b837703f7444ae6a59d93af9d))
