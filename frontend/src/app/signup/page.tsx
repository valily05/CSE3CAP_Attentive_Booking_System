import { SignUpForm } from "@/components/auth/AuthForms";
import { SignInLayout } from "@/components/auth/SignInLayout";

export default function Page() {
 return <SignInLayout registration><SignUpForm /></SignInLayout>;
}
