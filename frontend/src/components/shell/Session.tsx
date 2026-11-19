"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

type Session = { me: Me | null; ready: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> };
const Ctx = createContext<Session>({ me: null, ready: false, refresh: async () => {}, signOut: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/api/auth/me"));
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);
  const signOut = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => {});
    setMe(null);
  }, []);
  useEffect(() => {
    let live = true;
    api.get<Me>("/api/auth/me").then(
      (m) => live && (setMe(m), setReady(true)),
      () => live && setReady(true),
    );
    return () => {
      live = false;
    };
  }, []);
  return <Ctx.Provider value={{ me, ready, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
