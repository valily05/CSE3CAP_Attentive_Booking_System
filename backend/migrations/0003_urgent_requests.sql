CREATE TABLE urgent_request (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code text NOT NULL UNIQUE CHECK (booking_code ~ '^ATT[0-9]{4}$'),
    customer_name text NOT NULL,
    email text NOT NULL,
    whatsapp_number text,
    session_type text NOT NULL CHECK (session_type IN ('online', 'onsite')),
    location_id text REFERENCES location(id),
    qr_token_hash bytea NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONTACTED','CONFIRMED','COMPLETED','CANCELLED')),
    acknowledged_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CHECK ((session_type = 'online' AND location_id IS NULL) OR (session_type = 'onsite' AND location_id IS NOT NULL))
);
CREATE INDEX urgent_request_created ON urgent_request(created_at DESC);
CREATE TABLE urgent_request_limit (
    key_hash bytea NOT NULL,
    bucket timestamptz NOT NULL,
    attempts integer NOT NULL,
    PRIMARY KEY (key_hash, bucket)
);
CREATE TABLE urgent_request_status_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id uuid NOT NULL REFERENCES urgent_request(id),
    actor_id uuid NOT NULL REFERENCES app_user(id),
    old_status text NOT NULL,
    new_status text NOT NULL,
    changed_at timestamptz NOT NULL
);
