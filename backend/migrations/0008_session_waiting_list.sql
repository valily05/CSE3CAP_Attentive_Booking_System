-- Waiting requests remain separate from bookings and never reserve a slot.
CREATE TABLE session_waiting_list (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES client(id) ON DELETE CASCADE,
 psychologist_id uuid REFERENCES psychologist(id),service_id text NOT NULL REFERENCES service(id),
 preferred_date date NOT NULL,preferred_date_end date NOT NULL,
 periods text[] NOT NULL CHECK(cardinality(periods)>0 AND periods <@ ARRAY['morning','afternoon','evening']),
 session_type text NOT NULL CHECK(session_type IN ('chat','voice','video','in_person')),
 location_id text REFERENCES location(id),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','fulfilled','removed')),
 preferences_key text NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 CHECK(preferred_date_end>=preferred_date AND preferred_date_end-preferred_date<=30),
 CHECK((session_type='in_person')=(location_id IS NOT NULL))
);
CREATE UNIQUE INDEX waiting_active_preferences ON session_waiting_list(client_id,preferences_key) WHERE status='active';
CREATE INDEX waiting_active_dates ON session_waiting_list(preferred_date_end) WHERE status='active';
CREATE TABLE waiting_slot_state (
 request_id uuid NOT NULL REFERENCES session_waiting_list(id) ON DELETE CASCADE,slot_key text NOT NULL,
 available boolean NOT NULL,generation integer NOT NULL DEFAULT 1,PRIMARY KEY(request_id,slot_key)
);
CREATE TABLE waiting_delivery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES session_waiting_list(id) ON DELETE CASCADE,
 slot_key text NOT NULL,generation integer NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL,sent_at timestamptz,
 UNIQUE(request_id,slot_key,generation)
);
ALTER TABLE account_notification DROP CONSTRAINT account_notification_user_id_kind_key;
ALTER TABLE account_notification DROP CONSTRAINT account_notification_kind_check;
ALTER TABLE account_notification ADD CONSTRAINT account_notification_kind_check CHECK(kind IN ('welcome','waiting_slot'));
CREATE UNIQUE INDEX account_welcome_once ON account_notification(user_id,kind) WHERE kind='welcome';
ALTER TABLE account_notification ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE account_notification ADD COLUMN delivery_id uuid UNIQUE REFERENCES waiting_delivery(id) ON DELETE CASCADE;
