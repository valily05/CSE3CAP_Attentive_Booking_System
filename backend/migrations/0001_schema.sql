-- Attentive Care Connect, Group 09.
-- Shared with Group 05 (Scope Update §11): client, psychologist, service, booking.
-- Privacy (Scope §13): booking facts only. There is deliberately no column
-- for anything said in a session; lintguard fails the build if one appears.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Accounts ────────────────────────────────────────────────────────────
CREATE TABLE app_user (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email             text NOT NULL,
    password_hash     text NOT NULL,
    role              text NOT NULL CHECK (role IN ('client', 'psychologist', 'admin')),
    email_verified_at timestamptz,
    failed_logins     int  NOT NULL DEFAULT 0,
    locked_until      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_user_email_key ON app_user (lower(email));

CREATE TABLE auth_session (
    token_hash bytea PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE TABLE email_token (
    token_hash bytea PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
    purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz
);

-- ── Shared: Client ──────────────────────────────────────────────────────
CREATE TABLE client (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid UNIQUE REFERENCES app_user ON DELETE SET NULL, -- NULL for WhatsApp clients booked by admin
    name               text NOT NULL,
    email              text NOT NULL,
    phone              text NOT NULL,
    agreed_to_messages boolean NOT NULL DEFAULT false, -- check-in opt-in, never pre-ticked
    unsubscribed       boolean NOT NULL DEFAULT false,
    unsubscribe_token  text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── Admin-editable lists ────────────────────────────────────────────────
CREATE TABLE location (
    id     text PRIMARY KEY,           -- slug, e.g. 'bsd'
    name   text NOT NULL,              -- e.g. 'BSD (Tangerang)'
    active boolean NOT NULL DEFAULT true
);

-- ── Shared: Service ─────────────────────────────────────────────────────
CREATE TABLE service (
    id             text PRIMARY KEY,   -- slug, e.g. 'adult-60'
    name           text NOT NULL,
    length_minutes int  NOT NULL CHECK (length_minutes BETWEEN 30 AND 240),
    age_group      text NOT NULL CHECK (age_group IN ('adult', 'child_teen', 'family_couple')),
    active         boolean NOT NULL DEFAULT true
);

-- ── Shared: Psychologist ────────────────────────────────────────────────
CREATE TABLE psychologist (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid UNIQUE REFERENCES app_user ON DELETE SET NULL,
    name          text NOT NULL,
    title         text NOT NULL DEFAULT '',     -- e.g. 'M.Psi., Psikolog'
    specialty     text NOT NULL DEFAULT '',
    bio           text NOT NULL DEFAULT '',
    photo_url     text NOT NULL DEFAULT '',
    session_types text[] NOT NULL DEFAULT '{}'
        CHECK (session_types <@ ARRAY['chat', 'voice', 'video', 'in_person']),
    active        boolean NOT NULL DEFAULT true
);

CREATE TABLE psychologist_location (
    psychologist_id uuid NOT NULL REFERENCES psychologist ON DELETE CASCADE,
    location_id     text NOT NULL REFERENCES location,
    PRIMARY KEY (psychologist_id, location_id)
);

CREATE TABLE psychologist_service (
    psychologist_id uuid NOT NULL REFERENCES psychologist ON DELETE CASCADE,
    service_id      text NOT NULL REFERENCES service,
    PRIMARY KEY (psychologist_id, service_id)
);

-- ── Group 09: working hours, time off, blocks ───────────────────────────
CREATE TABLE weekly_hours (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    psychologist_id uuid NOT NULL REFERENCES psychologist ON DELETE CASCADE,
    weekday         smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
    start_minute    smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
    end_minute      smallint NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
    mode            text NOT NULL CHECK (mode IN ('online', 'in_person')),
    location_id     text REFERENCES location,
    CHECK (end_minute > start_minute),
    CHECK ((mode = 'online') = (location_id IS NULL))
);

CREATE TABLE unavailability (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    psychologist_id uuid NOT NULL REFERENCES psychologist ON DELETE CASCADE,
    kind            text NOT NULL CHECK (kind IN ('time_off', 'block')),
    starts_at       timestamptz NOT NULL,
    ends_at         timestamptz NOT NULL,
    label           text NOT NULL DEFAULT '', -- the psychologist's own label, e.g. 'Holiday'
    CHECK (ends_at > starts_at)
);

-- ── Shared: Booking ─────────────────────────────────────────────────────
CREATE TABLE booking (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE,
    client_id       uuid NOT NULL REFERENCES client,
    psychologist_id uuid NOT NULL REFERENCES psychologist,
    service_id      text NOT NULL REFERENCES service,
    mode            text NOT NULL CHECK (mode IN ('online', 'in_person')),
    online_channel  text CHECK (online_channel IN ('chat', 'voice', 'video')),
    location_id     text REFERENCES location,
    start_at        timestamptz NOT NULL,
    end_at          timestamptz NOT NULL,
    -- end_at + break; the exclusion constraint below keeps the break clear.
    blocked_until   timestamptz NOT NULL,
    status          text NOT NULL CHECK (status IN
        ('waiting_payment', 'confirmed', 'attended', 'no_show', 'cancelled', 'expired', 'paid_late')),
    -- A fixed list, never free text, so a client cannot type private details here.
    cancel_reason   text CHECK (cancel_reason IN ('schedule_conflict', 'travel', 'cost', 'other')),
    created_by      uuid REFERENCES app_user,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at AND blocked_until >= end_at),
    CHECK ((mode = 'online') = (location_id IS NULL)),
    CHECK ((mode = 'online') = (online_channel IS NOT NULL)),
    -- No double booking, even when two requests arrive in the same millisecond.
    CONSTRAINT booking_no_overlap EXCLUDE USING gist (
        psychologist_id WITH =,
        tstzrange(start_at, blocked_until) WITH &&
    ) WHERE (status IN ('waiting_payment', 'confirmed', 'attended', 'no_show'))
);
CREATE INDEX booking_client_idx ON booking (client_id, start_at);
CREATE INDEX booking_start_idx ON booking (start_at);

-- ── Group 09: message log (reminders, follow-ups) ───────────────────────
CREATE TABLE message_log (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id  uuid NOT NULL REFERENCES client,
    booking_id uuid REFERENCES booking,
    kind       text NOT NULL,
    sent_at    timestamptz NOT NULL DEFAULT now()
);
-- "Never send the same reminder twice", enforced by the database.
CREATE UNIQUE INDEX message_log_once_per_booking ON message_log (booking_id, kind) WHERE booking_id IS NOT NULL;
CREATE INDEX message_log_client_idx ON message_log (client_id, kind, sent_at DESC);

-- ── Group 09: admin history and settings ────────────────────────────────
CREATE TABLE audit_log (
    id         bigserial PRIMARY KEY,
    actor_id   uuid REFERENCES app_user,
    action     text NOT NULL,
    booking_id uuid REFERENCES booking,
    detail     jsonb NOT NULL DEFAULT '{}',
    at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE setting (
    key   text PRIMARY KEY,
    value int  NOT NULL
);
INSERT INTO setting (key, value) VALUES
    ('min_lead_minutes',         1440),  -- book at least 24h ahead
    ('change_cutoff_minute',      480),  -- 08:00 WIB
    ('break_minutes',              15),
    ('reminder_first_minutes',   1440),  -- 24h before
    ('reminder_second_minutes',   120),  -- 2h before
    ('follow_up_days',             60),  -- 30, 60 or 90
    ('follow_up_cooldown_days',    30);
