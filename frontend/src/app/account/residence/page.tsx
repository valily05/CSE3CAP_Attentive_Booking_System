import {getTranslations} from "next-intl/server";
import {SignInLayout} from "@/components/auth/SignInLayout";
import {ResidenceReview} from "@/components/auth/ResidenceReview";
export default async function Page(){const t=await getTranslations('auth');return <SignInLayout registration title={t('residenceReviewTitle')} description={t('residenceReviewBody')}><ResidenceReview/></SignInLayout>}
