import { SignInPage } from "@/components/auth/SignInPage";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <SignInPage next={(await searchParams).next} />;
}
