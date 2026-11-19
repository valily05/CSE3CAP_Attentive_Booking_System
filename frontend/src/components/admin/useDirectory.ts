"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Catalog, Psychologist } from "@/lib/types";

/** Locations, services and psychologists for admin pickers. */
export function useDirectory() {
  const [catalog, setCatalog] = useState<Catalog>({ locations: [], services: [] });
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  useEffect(() => {
    api.get<Catalog>("/api/catalog").then(setCatalog, () => {});
    api.get<{ psychologists: Psychologist[] }>("/api/psychologists").then((r) => setPsychologists(r.psychologists), () => {});
  }, []);
  return { catalog, psychologists };
}
