ALTER TABLE client
 ADD COLUMN residence_country text NOT NULL DEFAULT '',
 ADD COLUMN residence_other_country text NOT NULL DEFAULT '',
 ADD COLUMN residence_city text NOT NULL DEFAULT '',
 ADD COLUMN residence_timezone text NOT NULL DEFAULT '';
