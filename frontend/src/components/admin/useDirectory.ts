"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {useAdminBranch} from "./AdminBranch";
import type { Catalog, Psychologist } from "@/lib/types";

/** Locations, services and psychologists for admin pickers. */
export function useDirectory() {
  const branch=useAdminBranch();
  const [catalog, setCatalog] = useState<Catalog>({ locations: [], services: [] });
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  useEffect(() => {
    api.get<Catalog>("/api/catalog").then(setCatalog, () => {});
    api.get<{ psychologists: Psychologist[] }>("/api/psychologists").then((r) => setPsychologists(r.psychologists), () => {});
  }, []);
  return { catalog, psychologists:branch==="all"?psychologists:psychologists.filter(p=>p.locationIds.includes(branch)) };
}
