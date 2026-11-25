# Brevo registration email

The Go backend supports Brevo's transactional email API at `https://api.brevo.com/v3/smtp/email`. The API key stays on the server. Existing verification links, password hashing, and single-use verification tokens are preserved.

## Configure

Create `backend/.env.local` (ignored by Git) with your local database settings and:

```dotenv
MAIL_PROVIDER=brevo
BREVO_API_KEY=your-api-key
BREVO_SENDER_EMAIL=your-verified-sender@example.com
BREVO_SENDER_NAME=Attentive
PUBLIC_URL=http://127.0.0.1:3001
RUN_JOBS=false
```

Use an API key, not an SMTP key. Verify the sender email in Brevo. `PUBLIC_URL` must point to the website where recipients can open verification links; use the deployed HTTPS domain in production. Local loopback links work on the computer running the app.

Start the backend in PowerShell using:

```powershell
cd backend
.\Start-Local.ps1
```

The launcher loads the local environment file without executing its contents. For Linux or deployment, configure the same variables in the process environment or hosting secret manager. `go run ./cmd/api` alone reads process variables and does not load the file.

Explicit Brevo configuration fails startup if the key or sender is missing; it does not silently fall back to test email. `MAIL_PROVIDER=smtp` keeps the existing Mailpit development setup. With no provider setting, an existing Brevo API key selects Brevo, otherwise SMTP is used.

Keep background jobs disabled while testing against the seeded development database. Enabling them with real delivery also enables reminders and follow-up emails. The selected sender is shared by application emails.

## Registration behavior

New passwords must contain at least eight characters and one symbol, within bcrypt's 72-byte limit. Registration shows live checks and stays disabled until the required fields, password rules and privacy consent are valid. Sign-in accepts existing passwords and provides a show/hide control.

New signup requests also require `country` (`ID`, `SG`, `CN`, `JP`, `AU`, `OTHER`), `city`, and an IANA `timeZone`. For `OTHER`, provide `otherCountry`. The UI shows city/region options with GMT labels, derives the time zone automatically, and only enables submission when all required information and privacy consent are complete. Migration 0005 stores these residence fields. Existing client records are preserved. Verification emails include an HTML button as well as a plain-text alternative.

Signup saves the unverified account and sends its verification link. Brevo must return HTTP 201 with a message ID before signup reports email acceptance. Acceptance does not guarantee inbox delivery; recipient filtering and provider delivery policies still apply.

If delivery fails, signup returns `503 email_delivery_failed` and the website explains that the account was saved. The user can visit `/resend-verification` to request another verification email without recreating the account or changing its password. The sign-in page also links there when the email is unverified.

`POST /api/auth/resend-verification` accepts `email` and `locale`. It returns a generic response for unknown or already-verified accounts. Requests are limited to five per email and twenty per source IP per hour. Review trusted proxy handling before deploying behind a shared proxy. Existing verification links expire after 24 hours and are single-use.

## Validation

Automated tests cover Brevo payload and authentication headers; provider rejection, throttling and server errors; response acknowledgement; cancelled requests; configuration validation; signup delivery failures; resend and account verification; token replay; and resend limits.

Local browser tests covered registration, captured verification emails, requesting a fresh link, verification and sign-in at desktop and mobile sizes. These used Mailpit. Real Brevo delivery requires a configured API key and a verified sender and must be checked separately.

Official reference: https://developers.brevo.com/docs/send-a-transactional-email
