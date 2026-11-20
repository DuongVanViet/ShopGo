ALTER TABLE store_skus
  ADD COLUMN sale_price bigint,
  ADD COLUMN sale_starts_at timestamptz,
  ADD COLUMN sale_ends_at timestamptz,
  ADD CONSTRAINT store_skus_sale_valid CHECK (
    (sale_price IS NULL AND sale_starts_at IS NULL AND sale_ends_at IS NULL) OR
    (sale_price IS NOT NULL AND sale_starts_at IS NOT NULL AND sale_ends_at IS NOT NULL
      AND sale_price>0 AND sale_price<price AND sale_starts_at<sale_ends_at)
  );
ALTER TABLE order_items ADD COLUMN original_unit_price bigint CHECK(original_unit_price>=unit_price);
