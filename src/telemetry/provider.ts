import { trace, metrics } from "@opentelemetry/api"
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import type { Resource } from "@opentelemetry/resources"

export interface Providers {
  tracerProvider: BasicTracerProvider
  meterProvider: MeterProvider
}

export function initProviders(resource: Resource): Providers {
  const traceExporter = new OTLPTraceExporter()
  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(traceExporter, {
        maxQueueSize: 128,
        maxExportBatchSize: 32,
        scheduledDelayMillis: 15_000,
        exportTimeoutMillis: 10_000,
      }),
    ],
  })
  trace.setGlobalTracerProvider(tracerProvider)

  const metricExporter = new OTLPMetricExporter()
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60_000,
    exportTimeoutMillis: 10_000,
  })
  const meterProvider = new MeterProvider({ resource, readers: [metricReader] })
  metrics.setGlobalMeterProvider(meterProvider)

  return { tracerProvider, meterProvider }
}
