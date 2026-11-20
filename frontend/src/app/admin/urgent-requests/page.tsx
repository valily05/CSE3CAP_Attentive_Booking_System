import { UrgentAdmin } from "@/components/urgent/UrgentAdmin";
import { RequireRole } from "@/components/shell/RequireRole";
export default function Page() { return <RequireRole role="admin"><UrgentAdmin /></RequireRole>; }
