"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/shell/Session";
import { SignInForm, homeFor } from "./AuthForms";
import { AuthLayout } from "./AuthLayout";

export function SignInPage({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const { refresh } = useSession();
  return (
    <AuthLayout title={t("signInTitle")} description={t("signInDescription")}>
      <SignInForm
        onSignedIn={async (me) => {
          await refresh();
          router.push(homeFor(me.role, next));
        }}
      />
    </AuthLayout>
  );
}
