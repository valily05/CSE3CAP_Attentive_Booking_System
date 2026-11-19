/** Remembers the person's language for a year; the server reads it on every request. */
export function rememberLocale(l: "id" | "en"): void {
  document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
}
