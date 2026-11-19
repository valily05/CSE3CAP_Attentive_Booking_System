import { TokenAction } from "@/components/auth/AuthForms";
import styles from "../page.module.css";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <div className={styles.narrow}>
      <TokenAction path="/api/auth/verify" token={token} pending="auth.verifying" success="auth.verified" />
    </div>
  );
}
