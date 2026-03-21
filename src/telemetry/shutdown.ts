import type { Providers } from "./provider"

export async function shutdownProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      providers.tracerProvider.forceFlush(),
      providers.meterProvider.forceFlush(),
    ])
  } catch {}
}

export async function flushProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      providers.tracerProvider.forceFlush(),
      providers.meterProvider.forceFlush(),
    ])
  } catch {}
}
