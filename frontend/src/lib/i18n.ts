import { useLocale } from "next-intl";
import type { Locale } from "./time";

/** The active UI language as the time helpers expect it. */
export function useAppLocale(): Locale {
  return useLocale() === "en" ? "en" : "id";
}
