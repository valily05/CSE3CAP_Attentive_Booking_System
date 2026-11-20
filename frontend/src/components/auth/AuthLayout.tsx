import type { ReactNode } from "react";
import Image from "next/image";
import styles from "./AuthLayout.module.css";

export function AuthLayout({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.layout}>
      <div className={styles.intro}>
        <Image className={styles.foliage} src="/brand/gold-foliage-line-art.png" width={1024} height={1536} alt="" aria-hidden="true" priority />
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
