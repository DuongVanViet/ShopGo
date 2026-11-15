'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useShop } from '@/store/shop';

export function useResource<T>(path: string | null, pollMs = 0) {
  const { token } = useShop();
  const identity = `${token}:${path}`;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: unknown;
    loading: boolean;
  }>({ key: '', data: null, error: null, loading: false });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState((old) => ({
      key: identity,
      data: old.key === identity ? old.data : null,
      error: null,
      loading: true,
    }));
    api<T>(path, { token, signal: controller.signal })
      .then((data) => setState({ key: identity, data, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((old) => ({ ...old, key: identity, error, loading: false }));
      });
    return () => controller.abort();
  }, [path, token, identity, revision]);
  useEffect(() => {
    if (!pollMs || !path) return;
    const visibleRefresh = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(visibleRefresh, pollMs);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [path, pollMs, refresh]);
  const current = state.key === identity && !!path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!path && (!current || state.loading),
    refresh,
  };
}
