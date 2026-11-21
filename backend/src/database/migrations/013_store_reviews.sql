CREATE TABLE store_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  store_id uuid NOT NULL,
  rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK(char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id) ON DELETE CASCADE
);

CREATE INDEX store_reviews_recent ON store_reviews(store_id,created_at DESC,id DESC);
