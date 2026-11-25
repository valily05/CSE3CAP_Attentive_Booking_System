-- Public catalogue metadata, kept separately from local availability.
ALTER TABLE psychologist ADD COLUMN directory_metadata jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX psychologist_directory_source ON psychologist ((directory_metadata->>'sourceId')) WHERE directory_metadata ? 'sourceId';
ALTER TABLE service ADD COLUMN category_id text NOT NULL DEFAULT 'c-konseling';
ALTER TABLE service ADD COLUMN name_id text NOT NULL DEFAULT '';
ALTER TABLE service ADD COLUMN duration_note text NOT NULL DEFAULT '';
