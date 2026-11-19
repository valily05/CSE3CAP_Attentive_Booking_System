-- Emails are written in the client's chosen language (UI copy is never hard-coded).
ALTER TABLE client ADD COLUMN locale text NOT NULL DEFAULT 'id' CHECK (locale IN ('id', 'en'));
