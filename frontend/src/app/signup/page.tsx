import { getTranslations } from "next-intl/server";
import { SignUpForm } from "@/components/auth/AuthForms";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default async function Page() {
  const t = await getTranslations("auth");
  return (
    <AuthLayout title={t("signUpTitle")} description={t("signUpDescription")}>
      <SignUpForm />
    </AuthLayout>
  );
}
