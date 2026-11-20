CREATE TABLE product_favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  sku_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id, sku_id),
  FOREIGN KEY (store_id, sku_id) REFERENCES store_skus(store_id, sku_id) ON DELETE CASCADE
);
