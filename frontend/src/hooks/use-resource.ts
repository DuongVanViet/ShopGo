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
  const updateData = useCallback(
    (update: (data: T) => T) =>
      setState((old) =>
        old.key === identity && old.data !== null ? { ...old, data: update(old.data) } : old,
      ),
    [identity],
  );
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (!path || inFlight || controller.signal.aborted) return;
      inFlight = true;
      setState((old) => ({
        key: identity,
        data: old.key === identity ? old.data : null,
        error: null,
        loading: true,
      }));
      try {
        const data = await api<T>(path, { token, signal: controller.signal });
        if (!controller.signal.aborted)
          setState({ key: identity, data, error: null, loading: false });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((old) => ({ ...old, key: identity, error, loading: false }));
      } finally {
        inFlight = false;
      }
    }
    void load();
    const visibleRefresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = pollMs ? setInterval(visibleRefresh, pollMs) : undefined;
    if (pollMs) document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      clearInterval(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [path, token, identity, revision, pollMs]);
  const current = state.key === identity && !!path;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!path && (!current || state.loading),
    refresh,
    updateData,
  };
}
