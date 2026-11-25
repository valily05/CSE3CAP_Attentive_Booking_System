import {VerifyEmailReturn} from "@/components/auth/VerifyEmailReturn";
import { getTranslations } from "next-intl/server";
import { ResendVerificationPanel } from "@/components/auth/ResendVerificationPanel";
import { SignInLayout } from "@/components/auth/SignInLayout";

export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}) {
 const {token=""}=await searchParams;
 if(token)return <VerifyEmailReturn token={token}/>;
 const t = await getTranslations("auth");
 return <SignInLayout registration title={t("resendVerification")} hideDescription><ResendVerificationPanel/></SignInLayout>;
}
