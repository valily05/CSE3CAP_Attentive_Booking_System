# Session waiting list

The waiting list extends the existing booking page without holding or changing a booking. Only authenticated clients can join or manage their own requests. Preferences include service, a specific psychologist or anyone, a date/range of up to 31 days, one or more of the existing WIB day periods, session type, and location for in-person sessions. Period boundaries reuse the booking picker's before-noon / noon-to-17:00 / after-17:00 grouping and are supplied to the modal by `/api/waiting-list/options`.

Migration `0008_session_waiting_list.sql` adds requests, availability transition state, and a durable email outbox; it extends the existing account notification table. A partial unique index prevents identical active preferences, including simultaneous submissions. Only active requests are retained. Removal and explicit fulfillment (after a matching confirmed booking) delete the waiting request and its linked availability delivery/notification records. Neither action cancels or deletes any actual session booking. Migration `0009_active_waiting_requests_only.sql` clears previously inactive requests and enforces active-only storage.

Availability comes from `App.Slots`, which already subtracts bookings, breaks, blocks, and time off. Matching also enforces the greater of the configured minimum lead and 24 hours. Booking, cancellation, rescheduling, and hours changes reconcile availability immediately. A one-minute worker catches other availability changes and retries pending email deliveries. It uses a PostgreSQL advisory lock to prevent overlapping runs across processes. An opening has one delivery record per request, slot, and generation; a booked/closed slot that opens again is a new generation. In-app notices and email delivery records are created in the same transaction. Successful sends are recorded; failed sends stay pending. As with any external email provider, an accepted send followed by a database/network failure before acknowledgement can require a retry.

Notifications include psychologist, date/time (WIB), session type/location, and a link back to the existing booking flow with those choices preselected. The current slot must still be available, and clients must explicitly confirm a booking. Existing database double-booking protection remains authoritative. Multiple clients may receive the same opening.

Client endpoints:
- `GET /api/waiting-list/options` (periods and earliest eligible date, no schedule data)
- `GET/POST /api/me/waiting-list`
- `POST /api/me/waiting-list/{id}/remove`
- `POST /api/me/waiting-list/{id}/fulfill`

The worker is independently enabled by `RUN_WAITING_LIST=true` (the default), including when older reminder jobs are disabled with `RUN_JOBS=false`. No real emails are sent by isolated API tests; the real database is used with the email recorder. Browser checks cover desktop/mobile preference review, multi-period selection, submission, and management.
