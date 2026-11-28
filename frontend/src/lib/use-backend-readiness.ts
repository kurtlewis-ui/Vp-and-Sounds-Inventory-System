'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { waitForBackend } from './backend-readiness';

type ServerStatus = 'idle' | 'connecting' | 'waking' | 'ready';

/** One shared wait per mounted login page, not a recurring keep-alive. */
export function useBackendReadiness() {
  const [serverStatus, setServerStatus] = useState<ServerStatus>('idle');
  const active = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const readyAt = useRef(0);

  const ensureReady = useCallback((): Promise<void> => {
    if (active.current) return active.current.promise;
    if (readyAt.current && Date.now() - readyAt.current < 60_000) return Promise.resolve();
    const controller = new AbortController();
    setServerStatus('connecting');
    const promise = waitForBackend(api.defaults.baseURL || '', controller.signal, () => {
      if (!controller.signal.aborted) setServerStatus('waking');
    }).then(() => {
      if (controller.signal.aborted) throw new DOMException('Connection canceled', 'AbortError');
      readyAt.current = Date.now();
      setServerStatus('ready');
    }).catch(error => {
      if (!controller.signal.aborted) setServerStatus('idle');
      throw error;
    }).finally(() => {
      if (active.current?.controller === controller) active.current = null;
    });
    active.current = { controller, promise };
    return promise;
  }, []);

  useEffect(() => {
    void ensureReady().catch(() => { /* Show connection failures only after a login attempt. */ });
    return () => {
      active.current?.controller.abort();
      active.current = null;
    };
  }, [ensureReady]);

  return { ensureReady, serverStatus };
}
