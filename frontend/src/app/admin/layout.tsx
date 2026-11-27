import {Suspense,type ReactNode} from "react";
import {RequireRole} from "@/components/shell/RequireRole";
import {AdminShell} from "@/components/admin/AdminShell";
export default function AdminLayout({children}:{children:ReactNode}){return <RequireRole role="admin"><Suspense fallback={null}><AdminShell>{children}</AdminShell></Suspense></RequireRole>}
