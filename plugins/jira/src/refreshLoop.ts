const MINUTE_MS = 60_000

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

export async function runRefreshLoop(options: {
  signal: AbortSignal
  readMinutes(): Promise<number>
  refresh(signal: AbortSignal): Promise<unknown>
  sleep?(ms: number, signal: AbortSignal): Promise<void>
  onError?(message: string, error: unknown): void
}): Promise<void> {
  const { signal, readMinutes, refresh, sleep = abortableSleep, onError } = options
  const refreshOnce = async () => {
    try {
      await refresh(signal)
    } catch (error) {
      if (!signal.aborted) onError?.('ticket refresh failed', error)
    }
  }
  await refreshOnce()
  while (!signal.aborted) {
    await sleep((await readMinutes()) * MINUTE_MS, signal)
    if (signal.aborted) return
    await refreshOnce()
  }
}
