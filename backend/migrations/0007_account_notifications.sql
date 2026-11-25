-- Account-scoped onboarding notices, visible only after authentication.
CREATE TABLE account_notification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('welcome')),
 created_at timestamptz NOT NULL,
 read_at timestamptz,
 dismissed_at timestamptz,
 UNIQUE(user_id,kind)
);
CREATE INDEX account_notification_user_created ON account_notification(user_id,created_at DESC);
