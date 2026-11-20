import { UrgentConfirmation } from "@/components/urgent/UrgentConfirmation";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
 const { code } = await params;
 return <UrgentConfirmation code={code} />;
}
