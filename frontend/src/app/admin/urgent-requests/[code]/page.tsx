import { RequireRole } from "@/components/shell/RequireRole";
import { UrgentDetail } from "@/components/urgent/UrgentDetail";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
 const { code } = await params;
 return <RequireRole role="admin"><UrgentDetail code={code} /></RequireRole>;
}
