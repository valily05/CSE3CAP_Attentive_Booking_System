import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { SignInThemeToggle } from "./SignInThemeToggle";
import { SignInRoom } from "./SignInRoom";
import styles from "./SignInLayout.module.css";
import headerStyles from "../shell/Header.module.css";

export function SignInLayout({children, registration=false,title,description,hideDescription=false}:{children:ReactNode;registration?:boolean;title?:string;description?:string;hideDescription?:boolean}){
 const t=useTranslations("auth");const nav=useTranslations("nav");
 return <div data-signin-page className={`${styles.page} ${registration?styles.registration:""}`}><div className={styles.backRow}><Link href="/" className={styles.backLink}><ArrowLeft size={18} aria-hidden="true"/>{t("backToHome")}</Link><div className={styles.topActions}><SignInThemeToggle/><Link href={registration?"/signin":"/signup"} className={`${headerStyles.auth} ${headerStyles.createAccount}`}>{nav(registration?"signIn":"createAccount")}</Link></div></div><div className={styles.layout}>
  <section className={styles.formPanel} aria-labelledby="signin-title">
   <div className={styles.formInner}>
    <div className={styles.brandRow}><Image className={styles.mark} src="/brand/attentive-signin-logo-v2.png" width={64} height={64} alt={t("signInLogoAlt")} priority/><span className={styles.wordmark}>{t("wordmark")}</span></div>
    <h1 id="signin-title">{title||t(registration?"signUpTitle":"welcomeBack")}</h1>{!hideDescription&&<p className={styles.description}>{description||t(registration?"signUpDescription":"signInDescription")}</p>}
    {children}
   </div>
  </section>
  {registration?<aside className={styles.logoVisual} aria-hidden="true"><div className={styles.logoStage}><div className={styles.particles}>{Array.from({length:18},(_,i)=><span key={i} className={styles.particle} style={{left:((i*37+7)%96)+"%",top:((i*29+3)%93)+"%",width:(i%4===0?9:i%3===0?5:3)+"px",height:(i%4===0?9:i%3===0?5:3)+"px",animationDelay:(-i*.8)+"s",animationDuration:(6+i%5)+"s"}}/>)}</div><div className={styles.logoSculpture}><div className={styles.logoDepth}/><Image className={styles.logoFace} src="/brand/attentive-signin-logo-v2.png" width={564} height={564} alt="" priority/></div><div className={styles.logoShadow}/></div><span className={styles.sculptureWordmark}>{t("wordmark")}</span></aside>:<SignInRoom/>}
 </div></div>;
}
