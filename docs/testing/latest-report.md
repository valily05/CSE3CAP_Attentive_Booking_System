# Attentive automated test report

Date: 26 November 2026 (Asia/Jakarta).

| Layer | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Frontend Vitest | 130 | 0 | 0 |
| Backend top-level Go tests | 129 | 0 | 0 |
| Browser UI regression | 24 | 0 | 0 |

Go reports also contain subtests: 203 unique passed test/subtest records in total. Do not add that number to the top-level count. Backend totals merge the full suite and two newly added regression tests by unique package/test name.

All 38 curated test scenarios passed. Browser checks ran at 1440x1000, 1000x950 and 390x844; no retries or flaky passes. TypeScript, targeted ESLint and the backend build passed.

## Real defect found and fixed

Admin-created WhatsApp/walk-in clients received HTTP 422 because phone validation called full signup validation, which now requires residence details. Extracted reusable auth.ValidPhone and used it in AdminCreateClient. Signup still validates residence. New regressions prove invalid phones are rejected and valid contact creation does not require signup fields.

## Test maintenance

Updated stale UI expectations for Confirmed/No-show labels, dedicated account-page headers and decorative directory arrows. Fixed a timing-sensitive test that assumed network requests always finished in the order started. The initial backend run timed out with concurrent database test packages; the successful final run used -p 1 and workspace caches. Initial-run logs are preserved separately and are not presented as final failures.

## Scope and limits

Backend API/store tests used isolated migrated PostgreSQL databases and test email recorders/handlers. No user account was deleted and no live Brevo email was sent by this test run. Browser tests used the real Next.js UI with mocked API responses; they are not a complete browser-to-database-to-Brevo E2E run. Physical devices, Safari/iOS, load testing and a security audit were not performed. The older Linux/bash+Docker/Mailpit Playwright suite was not executed.

## Deliverables

- test-case-results.csv: scenario steps, expected results and outcomes.
- test-inventory.csv: individual automated tests and timings.
- frontend-vitest-final.json, backend-go-final.jsonl, backend-regressions.jsonl, browser-results.json: raw results.
- browser-report/index.html: Playwright report.
- rerun-instructions.md: commands and setup.
