"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/shell/Session";
import { SignInForm, homeFor } from "./AuthForms";
import styles from "@/app/page.module.css";

export function SignInPage({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const { refresh } = useSession();
  return (
    <div className={styles.narrow}>
      <h1>{t("signInTitle")}</h1>
      <SignInForm
        onSignedIn={async (me) => {
          await refresh();
          router.push(homeFor(me.role, next));
        }}
      />
    </div>
  );
}
