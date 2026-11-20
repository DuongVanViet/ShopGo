ALTER TABLE store_skus ADD COLUMN expires_on date;

CREATE INDEX store_skus_sellable_expiry
  ON store_skus(store_id,expires_on)
  WHERE active;
