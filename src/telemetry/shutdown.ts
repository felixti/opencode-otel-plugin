import type { Providers } from "./provider"

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms)
      if (typeof timer === "object" && "unref" in timer) {
        timer.unref()
      }
    }),
  ])
}

export async function shutdownProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      withTimeout(providers.tracerProvider.shutdown(), 10_000),
      withTimeout(providers.meterProvider.shutdown(), 10_000),
    ])
  } catch {
    // Intentionally swallowed — OTel shutdown errors must never propagate to the host
  }
}

export async function flushProviders(providers: Providers): Promise<void> {
  try {
    await Promise.allSettled([
      withTimeout(providers.tracerProvider.forceFlush(), 5_000),
      withTimeout(providers.meterProvider.forceFlush(), 5_000),
    ])
  } catch {
    // Intentionally swallowed — OTel flush errors must never propagate to the host
  }
}
