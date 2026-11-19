import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

/** Renders with the real message catalog, so tests read what users read. */
export function renderWithIntl(ui: ReactElement, locale: "en" | "id" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} timeZone="Asia/Jakarta">
      {ui}
    </NextIntlClientProvider>,
  );
}
