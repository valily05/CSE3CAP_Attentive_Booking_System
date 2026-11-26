# Attentive automated testing

The curated scenarios are in [test-cases.csv](test-cases.csv). They cover authentication, verification/reset, booking, cancellation/rescheduling, waiting-list matching, urgent requests, access control, history, notifications and responsive UI.

## Test layers

- **Vitest:** existing frontend component, helper and lint-rule tests. MSW supplies API test doubles.
- **Go:** domain, API and PostgreSQL integration tests. The storetest helper creates disposable databases cloned from a migrated template; it does not clear the application's database. Email assertions use recorders or test HTTP/SMTP handlers.
- **Playwright UI regression:** 8 critical flows at 1440px, 1000px and 390px (24 cases). Real browser + running Next.js site, with mocked API responses. This is UI regression coverage, not a claim that the entire browser-to-Brevo stack was tested.

## Run frontend tests

From frontend:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --pool=threads --testTimeout=20000
node node_modules/typescript/bin/tsc --noEmit
```

## Run backend tests

Start a local test PostgreSQL server with database-creation permissions. Set TEST_DATABASE_URL to its admin database, then from backend:

```powershell
$env:TEST_DATABASE_URL='postgres://careconnect:careconnect@127.0.0.1:5433/postgres?sslmode=disable'
go test -p 1 ./... -count=1 -timeout=15m
```

The URL above is the disposable local test configuration, not a production credential. -p 1 avoids competing package-level database clone/drop operations on Windows. Do not use -short when measuring integration coverage: it skips database tests.

## Run browser UI tests

Run the current Next.js production build on port 3003 and ensure Chrome is installed, then from frontend:

```powershell
npm run test:ui
```

UI_TEST_BASE_URL may override the site origin. The UI suite uses synthetic names, addresses and booking codes, intercepts all API requests and sends no real email. Reports go to outputs/attentive-test-results. Failed cases retain a screenshot and Playwright trace.

The older playwright.config.ts suite still targets a Linux/bash + Docker/Mailpit environment and predates several UI changes. It was not counted as passed in this run. The separate playwright.ui.config.ts is the portable current-UI suite.

## Defect fixed during this run

AdminCreateClient previously called ValidateSignUp only to validate a phone number. Signup now also requires residence, so valid admin-created contacts received 422. Phone validation was extracted into auth.ValidPhone and the admin use case now calls it independently. Existing registration residence checks are preserved. A new API regression verifies valid international contacts without residence and rejects malformed phone values. A domain regression checks valid and invalid numbers.

Existing UI tests were updated for intentional Confirmed/No-show terminology, the dedicated sign-in header and decorative directory arrows. The calendar query assertion now checks that the intended day request occurred, instead of assuming asynchronous request completion order.

## Limits

Passing these tests is not a security audit, load test, real-device certification or a live transactional-email delivery test. Browser checks use Chrome with desktop/tablet/mobile viewport sizes, not Safari/iOS or physical phones. Real admin-to-WhatsApp conversations and Google Meet sessions are external/manual and were not automated.
