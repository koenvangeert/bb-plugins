import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../errorMessage";

export const POLL_MS = 60_000;

export function usePolled<T>(load: () => Promise<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const next = await load();
      if (request !== latestRequest.current) return;
      setValue(next);
      setError(null);
    } catch (cause) {
      if (request === latestRequest.current) setError(errorMessage(cause));
    }
  }, [load]);

  const set = useCallback((next: T) => {
    latestRequest.current += 1;
    setValue(next);
    setError(null);
  }, []);

  useEffect(() => {
    setValue(null);
    setError(null);
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => {
      latestRequest.current += 1;
      clearInterval(poll);
    };
  }, [refresh]);

  return { value, error, refresh, set };
}
