"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@/lib/types";
import { useSession } from "./Session";

/** Shows children only to the right role. The API enforces this too; this is for a clear page. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const t = useTranslations();
  const { me, ready } = useSession();
  if (!ready) return <p>{t("common.loading")}</p>;
  if (!me)
    return (
      <p>
        {t("errors.unauthenticated")} <Link href="/signin">{t("nav.signIn")}</Link>
      </p>
    );
  if (me.role !== role) return <p role="alert">{t("errors.forbidden")}</p>;
  return <>{children}</>;
}
