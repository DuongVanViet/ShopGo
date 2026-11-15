ALTER TABLE categories ADD COLUMN owner_store_id uuid REFERENCES stores(id);
ALTER TABLE categories DROP CONSTRAINT categories_slug_key;

CREATE UNIQUE INDEX categories_global_slug_unique ON categories(slug) WHERE owner_store_id IS NULL;
CREATE UNIQUE INDEX categories_store_slug_unique ON categories(owner_store_id,slug) WHERE owner_store_id IS NOT NULL;
CREATE INDEX categories_owner_store ON categories(owner_store_id);
