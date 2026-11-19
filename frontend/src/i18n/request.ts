import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["id", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

/** The person's choice (cookie) wins; otherwise their browser's language. */
function pick(cookie: string | undefined, acceptLanguage: string | null): AppLocale {
  if (cookie === "en" || cookie === "id") return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const lang = part.trim().slice(0, 2).toLowerCase();
    if (lang === "id" || lang === "ms") return "id";
    if (lang === "en") return "en";
  }
  return "id";
}

export default getRequestConfig(async () => {
  const locale = pick((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return {
    locale,
    timeZone: "Asia/Jakarta",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
