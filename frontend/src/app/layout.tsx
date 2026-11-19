import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1c36" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Regional tags make native date/time inputs use 24-hour time, like the rest of the app.
  return (
    <html lang={locale === "en" ? "en-GB" : "id-ID"} className={montserrat.variable}>
      <body>
        <NextIntlClientProvider>
          <SessionProvider>
            <Header />
            <main id="main" className={styles.main}>
              {children}
            </main>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
