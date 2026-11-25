# Registration recovery

- Duplicate signup returns `account_unverified` for unverified client accounts and `email_taken` for verified accounts. Neither retry sends an email nor changes account data or passwords.
- Resend is a separate `/resend-verification` page. Email is prefilled from local recovery context. Sending uses the existing verification API and rate limits plus a 60-second UI cooldown.
- Proposed residence fields are held in localStorage for 12 hours. Passwords, verification tokens, phone numbers, and names are not included. The draft is tied to the email address and stays within that browser.
- After email verification and sign-in, the matching client can review the proposal at `/account/residence`, save it, or keep their existing details. A different email or expired draft is ignored. Successful save or keeping existing details clears the matching draft.
- GET/PUT `/api/me/residence` require a client session. The client id comes only from the authenticated actor. PUT validates country/time-zone consistency and updates only residence fields.

Validation: production Next build; auth/password frontend tests; real PostgreSQL API integration tests using isolated test databases and a recorded mail sender; desktop/mobile Playwright recovery flow and draft safety checks. No live verification emails were sent by these checks.

Email verification links use the neutral /verify callback. Old /resend-verification?token=... links remain supported without rendering the resend form first. After verifying, the callback returns to the last visible app path in this browser, with a top-right notification. The currently open original tab is notified without navigation.

The Check your inbox view at /signup and the separate resend form remain distinct. If the last visible view was the inbox card, its email and card are restored in the verification tab without submitting registration again. Only path, view, email and timestamp are kept as page context; passwords and verification tokens are never stored. Token-bearing paths, external paths and expired context are rejected; missing history falls back to /signin. Notifications wait while a tab is hidden so the user can see them when returning.

The verified response still requires a valid single-use token. Invalid or expired links return to the last app page with an error notification. API tests use isolated PostgreSQL databases and recorded email. Browser checks cover desktop/mobile, both resend-related screens, cross-tab notices, same-tab returns, inbox restoration and unsafe-history rejection.

Email verification buttons explicitly use target="_self" (the current browsing context). This is a preference for web clients, not a way to select a browser application: native email and webmail settings may still choose a different browser or tab. Same-browser app page return and cross-tab notifications continue to apply.
