CREATE TABLE product_images (
 product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 storage_key text NOT NULL UNIQUE CHECK(storage_key ~ '^[0-9a-f-]+\.(jpg|png|webp)$'),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 original_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
