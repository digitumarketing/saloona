/**
 * Data-loading hooks.
 *
 * Three small hooks cover every screen in the dashboard: load-on-mount,
 * load-on-demand (mutations), and debounced search. A data-fetching library was
 * considered and rejected — the app has one origin, cookie auth, and no
 * cross-screen cache requirement beyond the bootstrap payload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the loader, keeping the previous data on screen while it runs. */
  reload: () => void;
  /** Applies a local change without a round trip, for optimistic updates. */
  setData: (next: T | null) => void;
}

/**
 * Loads data when `deps` change.
 *
 * In-flight requests are aborted when deps change again, so a fast typist does
 * not end up with an older response overwriting a newer one.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Held in a ref so changing the loader identity every render (the normal case
  // for an inline arrow) does not retrigger the effect.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    loaderRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(errorMessage(cause));
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, reload, setData };
}

/**
 * Wraps a mutation so a button can show progress and surface an error without
 * every screen repeating the same try/catch/setBusy triple.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>
): {
  run: (...args: TArgs) => Promise<TResult | null>;
  busy: boolean;
  error: string | null;
  fields: Record<string, string>;
  reset: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: TArgs): Promise<TResult | null> => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      return await actionRef.current(...args);
    } catch (cause: unknown) {
      // Field errors render next to their input; the banner only carries what is
      // left over, so a form does not say the same thing twice.
      const validation = cause as { fields?: Record<string, string> };
      if (validation?.fields) setFields(validation.fields);
      else setError(errorMessage(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setFields({});
  }, []);

  return { run, busy, error, fields, reset };
}

/** Debounces a value, used for search-as-you-type against the customer list. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
