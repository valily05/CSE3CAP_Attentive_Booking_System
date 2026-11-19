// @vitest-environment node
// Specs for the project's own lint rules. Written before the rules exist.
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import tsParser from "@typescript-eslint/parser";
import plugin from "./attentive.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-raw-text", plugin.rules["no-raw-text"], {
  valid: [
    "const a = <p>{t('booking.title')}</p>",
    "const a = <p>   </p>",
    "const a = <p>{code} · {time}</p>", // punctuation and symbols are fine
    "const a = <input aria-label={t('search.label')} />",
    "const a = <div className='band' data-testid='x' />", // non-user-facing attributes
  ],
  invalid: [
    { code: "const a = <p>Book a session</p>", errors: [{ messageId: "rawText" }] },
    { code: "const a = <button>OK</button>", errors: [{ messageId: "rawText" }] },
    { code: "const a = <input placeholder='Your name' />", errors: [{ messageId: "rawAttr" }] },
    { code: "const a = <img alt='Photo' src='x.png' />", errors: [{ messageId: "rawAttr" }] },
    { code: "const a = <a aria-label='Close'>{x}</a>", errors: [{ messageId: "rawAttr" }] },
    { code: "const a = <p>{'Sorry, this time was just taken'}</p>", errors: [{ messageId: "rawText" }] },
  ],
});

tester.run("no-hardcoded-locations", plugin.rules["no-hardcoded-locations"], {
  valid: [
    "const l = catalog.locations.find((x) => x.id === id)",
    "const s = 'Jakartanese'", // whole words only
    "const zone = 'Asia/Jakarta'", // an IANA time zone, not an office location
  ],
  invalid: [
    { code: "const l = 'Jakarta'", errors: [{ messageId: "location" }] },
    { code: "const opts = ['bsd', 'malang']", errors: [{ messageId: "location" }, { messageId: "location" }] },
    { code: "const s = `BSD (Tangerang)`", errors: [{ messageId: "location" }] },
  ],
});

tester.run("no-clinical-fields", plugin.rules["no-clinical-fields"], {
  valid: [
    "const booking = { code, start, status }",
    "// we never store a diagnosis\nconst x = 1",
    "const help = 'we never store therapy notes'",
  ],
  invalid: [
    { code: "const diagnosis = ''", errors: [{ messageId: "clinical" }] },
    { code: "const b = { therapyNotes: '' }", errors: [{ messageId: "clinical" }] },
    { code: "type Client = { session_notes: string }", errors: [{ messageId: "clinical" }] },
    { code: "function f(keluhan: string) {}", errors: [{ messageId: "clinical" }] },
  ],
});

tester.run("wib-time-only", plugin.rules["wib-time-only"], {
  valid: [
    "formatTime(start, locale)",
    "new Date(iso)",
  ],
  invalid: [
    { code: "d.toLocaleTimeString()", errors: [{ messageId: "useHelper" }] },
    { code: "d.toLocaleDateString('id-ID')", errors: [{ messageId: "useHelper" }] },
    { code: "d.toLocaleString()", errors: [{ messageId: "useHelper" }] },
    { code: "new Intl.DateTimeFormat('en')", errors: [{ messageId: "useHelper" }] },
  ],
});

tester.run("no-server-env-in-client", plugin.rules["no-server-env-in-client"], {
  valid: [
    "'use client';\nconst u = process.env.NEXT_PUBLIC_SITE_URL",
    "const k = process.env.SMTP_PASSWORD", // server file
  ],
  invalid: [
    { code: "'use client';\nconst k = process.env.API_SECRET", errors: [{ messageId: "serverEnv" }] },
    { code: "\"use client\";\nconst { SMTP_PASSWORD } = process.env", errors: [{ messageId: "serverEnv" }] },
  ],
});
