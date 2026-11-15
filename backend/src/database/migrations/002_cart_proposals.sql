CREATE TABLE cart_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), store_id uuid NOT NULL REFERENCES stores(id),
 cart_id uuid NOT NULL REFERENCES carts(id), cart_version integer NOT NULL, items jsonb NOT NULL, snapshot jsonb NOT NULL,
 added_total bigint NOT NULL CHECK(added_total>=0), cart_total bigint NOT NULL CHECK(cart_total>=0), budget bigint CHECK(budget>0),
 nonce text NOT NULL, confirmation_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, applied_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposals_user_expiry ON cart_proposals(user_id,expires_at);
