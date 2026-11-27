CREATE TABLE profile_email_change (
 user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
 email text NOT NULL,token_hash bytea NOT NULL UNIQUE,expires_at timestamptz NOT NULL
);
