# Attentive Care Connect

**Group 09 – Integrated Booking & Client Management Platform** (CSE3CAP).

Clients find a psychologist, book a session online or in person, and change or cancel it themselves, with no WhatsApp needed. Psychologists set their working hours, and admin staff run every booking from one calendar. Scope: `Scope update (Sorry!).pdf` and `Attentive Appendix - feature details.pdf`, features G09-1 to G09-10.

| Part | Tech | Folder |
|---|---|---|
| Website | Next.js 16, React 19, TypeScript, next-intl (EN/ID) | `frontend/` |
| API and background jobs | Go 1.27, stdlib router, pgx | `backend/` |
| Database | PostgreSQL 18 | `docker-compose.yml` |
| Email (development) | Mailpit, which catches all mail at http://localhost:8025 | `docker-compose.yml` |

## Setup

You need Docker, Node 24 or newer, and Go 1.27. Run `make help` to see every command.

```bash
make up        # Postgres on :5433 and Mailpit on :8025
make seed      # test data only: 17 psychologists, 3 services, 3 locations + online, 60 clients
make api       # API on http://localhost:8080 (runs migrations on start)
make web       # website on http://localhost:3000 (in a second terminal)
```

Run `npm install` inside `frontend/` once before `make web`.

Test logins created by the seed (development only):

| Role | Email | Password |
|---|---|---|
| Admin | admin@attentive.test | attentive-staff |
| Psychologist | ayu@attentive.test | attentive-staff |
| Client | rina@example.test | attentive-client |

Configuration comes from environment variables only. See `backend/.env.example` and `frontend/.env.example`. Secret keys never go in code (Scope §13). Brevo, Mailgun and SendGrid all work through the `SMTP_*` settings.

## Checks

```bash
make lint      # golangci-lint and ESLint (including the project rules below), plus tsc
make test      # Go unit and Postgres integration tests, and Vitest component tests
make e2e       # Playwright in a real browser against the real stack (desktop and phone)
make check     # lint + test, the same as CI
```

The project was built test-first, one slice at a time, from the inside out:

1. **Domain rules** (`backend/internal/domain`): pure Go with no database. Covers open slots, the 15-minute break, the 24-hour lead time, the 08:00 WIB change deadline, reminders at 24h and 2h (never twice), follow-up eligibility, the no-show rate, and the 5-try lockout.
2. **Postgres** (`backend/internal/store`): each test gets its own real database. One test has ten clients race for the same slot and checks that exactly one wins.
3. **HTTP API** (`backend/internal/httpapi`, `internal/app`): the real router and database. Only the clock and email are faked.
4. **Website** (`frontend/src/**/*.test.tsx`): components tested with the network mocked at the boundary (MSW).
5. **End-to-end** (`frontend/e2e`): sign up with a real confirmation email, book, move, cancel, and check admin and psychologist views.

## Project rules enforced by lint

| Rule | Where | Why |
|---|---|---|
| No clinical fields (diagnosis, therapy notes, symptoms…) in Go, SQL or TypeScript | `backend/internal/lintguard`, `attentive/no-clinical-fields` | Scope §13: booking facts only |
| No hard-coded UI text | `attentive/no-raw-text` | Every word comes from `frontend/messages/{en,id}.json` |
| No hard-coded locations | `attentive/no-hardcoded-locations` | Locations are an admin-editable list |
| Dates only through the WIB helper | `attentive/wib-time-only` | All times are shown in WIB |
| No server env vars in client components | `attentive/no-server-env-in-client` | Keys never reach the browser |
| `time.Now` only through an injected clock | `forbidigo` | Time rules are testable |
| Domain code cannot import DB or HTTP packages | `depguard` | Business rules stay pure |

The ESLint rules have their own tests in `frontend/eslint/attentive.test.mjs`.

## Shared tables (with Group 05)

`client`, `psychologist`, `service` and `booking` follow Scope §11. Booking statuses use Group 05's values (`waiting_payment`, `confirmed`, `attended`, `no_show`, `cancelled`, `expired`, `paid_late`). Group 09 creates bookings as `confirmed`. The schema is in `backend/migrations/`.

## Design

The visual design is based on attentiveid.com (navy `#14284B`, brass `#D6A74D`, Montserrat), with three signature pieces:

- **Directory board:** psychologists listed like the brass name plates in a bureau's lobby.
- **Daylight band:** each day is drawn from dawn to dusk, with open times cut into it as lit windows.
- **Appointment card:** a tear-off stub carrying the booking code.

The search is a sentence the client fills in: *"I'm looking for adult counseling, online, anywhere."*
