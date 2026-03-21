import type { Providers } from "./provider"

export async function shutdownProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      providers.tracerProvider.shutdown(),
      providers.meterProvider.shutdown(),
    ])
  } catch {
    // Intentionally swallowed — OTel shutdown errors must never propagate to the host
  }
}

export async function flushProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      providers.tracerProvider.forceFlush(),
      providers.meterProvider.forceFlush(),
    ])
  } catch {
    // Intentionally swallowed — OTel flush errors must never propagate to the host
  }
}
