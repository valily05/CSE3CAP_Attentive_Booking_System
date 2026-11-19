import { TokenAction } from "@/components/auth/AuthForms";
import styles from "../page.module.css";

// One click from the email, no sign-in needed (G09-8).
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <div className={styles.narrow}>
      <TokenAction path="/api/unsubscribe" token={token} pending="auth.unsubscribing" success="auth.unsubscribed" />
    </div>
  );
}
