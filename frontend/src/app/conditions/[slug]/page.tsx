import { notFound } from "next/navigation";
import { CONDITIONS } from "@/lib/conditions";
import { ConditionGuide } from "@/components/conditions/ConditionGuide";

export function generateStaticParams() { return CONDITIONS.map(c=>({slug:c.slug})); }
export default async function Page({params}: {params: Promise<{slug:string}>}) {
  const {slug} = await params;
  const condition = CONDITIONS.find(c=>c.slug===slug);
  if (!condition) notFound();
  return <ConditionGuide condition={condition}/>;
}
