"use client";
import {PasswordResetNotice} from "./PasswordRecovery";

import { useRouter } from "next/navigation";
import { useSession } from "@/components/shell/Session";
import { SignInForm, homeFor } from "./AuthForms";
import { readRegistrationRecovery } from "@/lib/registration-recovery";
import { SignInLayout } from "./SignInLayout";

export function SignInPage({ next }: { next?: string }) {
  const router = useRouter();
  const { refresh } = useSession();
  return (
    <SignInLayout>
      <PasswordResetNotice/><SignInForm
        onSignedIn={async (me) => {
          await refresh();
          const recovery=readRegistrationRecovery();
          const review=recovery?.residence&&recovery.email===me.email.toLowerCase()?"/account/residence":undefined;
          router.push(homeFor(me.role, next||review));
        }}
      />
    </SignInLayout>
  );
}
