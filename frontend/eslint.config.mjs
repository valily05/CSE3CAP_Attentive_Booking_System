import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import attentive from "./eslint/attentive.mjs";

// Lint rules for the Care Connect website.
// The `attentive/*` rules are project-specific (see eslint/attentive.mjs
// and its tests in eslint/attentive.test.mjs).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { attentive },
    rules: {
      // Scope-driven rules
      "attentive/no-raw-text": "error",
      "attentive/no-hardcoded-locations": "error",
      "attentive/no-clinical-fields": "error",
      "attentive/wib-time-only": "error",
      "attentive/no-server-env-in-client": "error",

      // General strictness
      "no-console": "error", // logs in a browser can leak personal data
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "TSAsExpression > TSAnyKeyword", message: "Do not cast to any; type the value." },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "react/jsx-no-target-blank": "error",
      "jsx-a11y/no-autofocus": "error",
    },
  },
  {
    // The one place allowed to format dates (always with timeZone: Asia/Jakarta).
    files: ["src/lib/time.ts"],
    rules: { "attentive/wib-time-only": "off" },
  },
  {
    // Tests describe behaviour in plain words and use fixture data.
    files: ["**/*.test.{ts,tsx,mjs}", "e2e/**", "src/test/**"],
    rules: {
      "attentive/no-raw-text": "off",
      "attentive/no-hardcoded-locations": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
