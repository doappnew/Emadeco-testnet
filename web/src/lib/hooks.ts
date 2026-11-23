import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** Charge des données ; gère chargement, erreur et rechargement. `deps` relance la requête. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((d) => {
        if (!cancelled && alive.current) setData(d);
      })
      .catch((e) => {
        if (!cancelled && alive.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled && alive.current) setLoading(false);
      });
    return () => {
      cancelled = true;
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/** Appelle `fn` toutes les `ms` millisecondes tant que le composant est monté et l'onglet visible. */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
