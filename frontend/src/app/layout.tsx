import {SiteToast} from "@/components/shell/SiteToast";
import {Suspense} from "react";
import {ClientPageTracker} from "@/components/auth/ClientPageTracker";
import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { EmailVerificationToast } from "@/components/auth/EmailVerificationToast";
import { Header } from "@/components/shell/Header";
import { SessionProvider } from "@/components/shell/Session";
import "./globals.css";
import styles from "./layout.module.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export const viewport: Viewport = {
  themeColor: "#142c52",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const preference = (await cookies()).get("theme")?.value;
  const theme = preference === "light" || preference === "dark" ? preference : undefined;
  // Regional tags make native date/time inputs use 24-hour time, like the rest of the app.
  return (
    <html lang={locale === "en" ? "en-GB" : "id-ID"} className={montserrat.variable} data-theme={theme}>
      <body>
        <NextIntlClientProvider>
          <SessionProvider>
            <Header />
            <EmailVerificationToast /><SiteToast/>
            <Suspense fallback={null}><ClientPageTracker/></Suspense>
            <main id="main" className={styles.main}>
              {children}
            </main>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
