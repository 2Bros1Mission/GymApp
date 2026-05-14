import { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';

interface UseAsyncDataOptions<T> {
  fetcher: () => Promise<T>;
  defaultValue: T;
  enabled?: boolean;
}

interface UseAsyncDataReturn<T> {
  data: T;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useAsyncData<T>({
  fetcher,
  defaultValue,
  enabled = true,
}: UseAsyncDataOptions<T>): UseAsyncDataReturn<T> {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const execute = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      if (mountedRef.current && id === fetchIdRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current && id === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (mountedRef.current && id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [fetcher, enabled]);

  useEffect(() => {
    execute();
  }, [execute]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  return { data, loading, error, retry: execute };
}

export function useFocusAsyncData<T>(
  options: UseAsyncDataOptions<T>,
): UseAsyncDataReturn<T> {
  const [data, setData] = useState<T>(options.defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const execute = useCallback(async () => {
    if (!options.enabled) {
      setLoading(false);
      return;
    }

    const id = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await options.fetcher();
      if (mountedRef.current && id === fetchIdRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current && id === fetchIdRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (mountedRef.current && id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [options.fetcher, options.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => {
    execute();
  }, [execute]));

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  return { data, loading, error, retry: execute };
}
