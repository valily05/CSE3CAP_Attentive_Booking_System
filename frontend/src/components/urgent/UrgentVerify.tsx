"use client";
import { RequireRole } from "@/components/shell/RequireRole";
import { UrgentAdmin } from "./UrgentAdmin";
export function UrgentVerify() { return <RequireRole role="admin"><UrgentAdmin verify /></RequireRole>; }
