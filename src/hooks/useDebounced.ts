"use client";

import { useCallback, useEffect, useRef } from "react";

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(callback);

  useEffect(() => {
    cb.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);

  return useCallback(
    (...args: A) => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => {
        t.current = null;
        cb.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
