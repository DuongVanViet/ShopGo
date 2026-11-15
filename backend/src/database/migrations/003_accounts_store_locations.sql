ALTER TABLE users ADD COLUMN email_normalized text UNIQUE;
ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE users ADD COLUMN account_type text NOT NULL DEFAULT 'USER' CHECK(account_type IN ('USER','SELLER'));
ALTER TABLE users ADD CONSTRAINT normalized_email CHECK(email_normalized IS NULL OR (email_normalized=lower(btrim(email_normalized)) AND length(email_normalized)<=254));

ALTER TABLE stores ADD COLUMN owner_user_id uuid REFERENCES users(id);
ALTER TABLE stores ADD COLUMN contact_phone text;
ALTER TABLE stores ADD COLUMN contact_email text;
ALTER TABLE stores ADD COLUMN address_details jsonb;
ALTER TABLE stores ADD COLUMN latitude double precision CHECK(latitude BETWEEN -90 AND 90);
ALTER TABLE stores ADD COLUMN longitude double precision CHECK(longitude BETWEEN -180 AND 180);
ALTER TABLE stores ADD COLUMN location_source text CHECK(location_source IN ('GPS','MAP','COORDINATES'));
ALTER TABLE stores ADD COLUMN location_accuracy_meters double precision CHECK(location_accuracy_meters>=0 AND location_accuracy_meters<=100000);
ALTER TABLE stores ADD COLUMN location_confirmed_at timestamptz;
ALTER TABLE stores ADD COLUMN location_version integer NOT NULL DEFAULT 1;
ALTER TABLE stores ADD CONSTRAINT coordinate_pair CHECK((latitude IS NULL)=(longitude IS NULL));
ALTER TABLE stores ADD CONSTRAINT registered_store_location CHECK(owner_user_id IS NULL OR
  (latitude IS NOT NULL AND longitude IS NOT NULL AND address_details IS NOT NULL AND location_source IS NOT NULL AND location_confirmed_at IS NOT NULL));
CREATE INDEX stores_owner ON stores(owner_user_id);
