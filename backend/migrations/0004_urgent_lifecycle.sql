ALTER TABLE location ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE location ADD COLUMN maps_url text NOT NULL DEFAULT '';

ALTER TABLE urgent_request ALTER COLUMN qr_token_hash DROP NOT NULL;
COMMENT ON COLUMN urgent_request.qr_token_hash IS 'Legacy QR lookup only. New QR images encode booking_code exclusively.';
ALTER TABLE urgent_request
 ADD COLUMN submitted_at timestamptz,
 ADD COLUMN owner_access_hash bytea UNIQUE,
 ADD COLUMN access_expires_at timestamptz,
 ADD COLUMN client_id uuid REFERENCES client,
 ADD COLUMN appointment_id uuid UNIQUE REFERENCES booking,
 ADD COLUMN assigned_psychologist_id uuid REFERENCES psychologist,
 ADD COLUMN assigned_service_id text REFERENCES service,
 ADD COLUMN assigned_channel text,
 ADD COLUMN proposed_start timestamptz,
 ADD COLUMN assigned_at timestamptz,
 ADD COLUMN confirmed_at timestamptz,
 ADD COLUMN checked_in_at timestamptz,
 ADD COLUMN completed_at timestamptz,
 ADD COLUMN cancelled_at timestamptz,
 ADD COLUMN linked_at timestamptz,
 ADD COLUMN linked_by_admin_id uuid REFERENCES app_user,
 ADD COLUMN checked_in_by_admin_id uuid REFERENCES app_user,
 ADD COLUMN assigned_by_admin_id uuid REFERENCES app_user,
 ADD COLUMN confirmed_by_admin_id uuid REFERENCES app_user,
 ADD COLUMN arrival_status text CHECK(arrival_status IN ('now','10','20','30','later')),
 ADD COLUMN estimated_departure_at timestamptz,
 ADD COLUMN arrival_updated_at timestamptz,
 ADD COLUMN readiness text NOT NULL DEFAULT 'awaiting' CHECK(readiness IN ('awaiting','ready','unavailable')),
 ADD COLUMN submission_key_hash bytea UNIQUE;
UPDATE urgent_request SET submitted_at=created_at,owner_access_hash=qr_token_hash,access_expires_at=created_at+interval '24 hours';
ALTER TABLE urgent_request ALTER COLUMN submitted_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE urgent_request ALTER COLUMN submitted_at SET NOT NULL;
ALTER TABLE urgent_request DROP CONSTRAINT urgent_request_status_check;
ALTER TABLE urgent_request ADD CONSTRAINT urgent_request_status_check CHECK(status IN ('PENDING','CONTACTED','CHECKED_IN','ASSIGNED','CONFIRMED','COMPLETED','CANCELLED'));

CREATE TABLE urgent_access (
 token_hash bytea PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES urgent_request,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 purpose text NOT NULL CHECK(purpose IN ('recovery','owner'))
);
CREATE TABLE client_account_link (
 token_hash bytea PRIMARY KEY,
 client_id uuid NOT NULL REFERENCES client,
 actor_id uuid NOT NULL REFERENCES app_user,
 purpose text NOT NULL CHECK(purpose IN ('activate','change_email')),
 email text NOT NULL,
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);

CREATE FUNCTION audit_urgent_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_log(action,detail) VALUES('urgent:submitted',jsonb_build_object('urgentCode',NEW.booking_code));
 RETURN NEW;
END $$;
CREATE TRIGGER urgent_submission_activity AFTER INSERT ON urgent_request
 FOR EACH ROW EXECUTE FUNCTION audit_urgent_submission();

CREATE FUNCTION preserve_urgent_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.booking_code IS DISTINCT FROM OLD.booking_code THEN
  RAISE EXCEPTION 'urgent submission identity is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER urgent_submission_immutable BEFORE UPDATE ON urgent_request
 FOR EACH ROW EXECUTE FUNCTION preserve_urgent_submission();

CREATE FUNCTION sync_urgent_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('attended','cancelled') THEN
  UPDATE urgent_request SET status=CASE WHEN NEW.status='attended' THEN 'COMPLETED' ELSE 'CANCELLED' END,
   completed_at=CASE WHEN NEW.status='attended' THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE completed_at END,
   cancelled_at=CASE WHEN NEW.status='cancelled' THEN COALESCE(cancelled_at,CURRENT_TIMESTAMP) ELSE cancelled_at END,
   updated_at=CURRENT_TIMESTAMP WHERE appointment_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER urgent_appointment_status AFTER UPDATE OF status ON booking
 FOR EACH ROW EXECUTE FUNCTION sync_urgent_appointment();
