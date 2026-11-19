"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorCode } from "./api";

type State<T> = { url: string | null; data?: T; error?: string };

/**
 * GETs `url` (or nothing while it is null) and re-fetches when it changes or
 * on reload(). Results from an older URL are never shown for a newer one.
 */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<State<T>>({ url: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) return;
    let live = true;
    api.get<T>(url).then(
      (data) => live && setState({ url, data }),
      (e) => live && setState({ url, error: errorCode(e) }),
    );
    return () => {
      live = false;
    };
  }, [url, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = state.url === url;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, reload };
}
