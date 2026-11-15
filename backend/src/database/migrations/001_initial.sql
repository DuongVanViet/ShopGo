CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone_normalized text UNIQUE,
 display_name text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LOCKED','DEACTIVATED')),
 is_admin boolean NOT NULL DEFAULT false, can_refund boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stores (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 address text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAUSED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE store_memberships (
 user_id uuid NOT NULL REFERENCES users(id), store_id uuid NOT NULL REFERENCES stores(id),
 role text NOT NULL CHECK(role IN ('PICKER','COUNTER','MANAGER')), PRIMARY KEY(user_id,store_id,role)
);
CREATE TABLE auth_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE otp_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone_normalized text NOT NULL, code_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0), expires_at timestamptz NOT NULL,
 used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_time ON otp_challenges(phone_normalized,created_at);
CREATE TABLE rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL
);
CREATE TABLE categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE
);
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid REFERENCES categories(id), name text NOT NULL,
 description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE skus (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
 code text NOT NULL UNIQUE, barcode text UNIQUE, name text NOT NULL, unit text NOT NULL DEFAULT 'piece', active boolean NOT NULL DEFAULT true
);
CREATE TABLE store_skus (
 store_id uuid NOT NULL REFERENCES stores(id), sku_id uuid NOT NULL REFERENCES skus(id),
 price bigint NOT NULL CHECK(price >= 0 AND price <= 1000000000000), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(store_id,sku_id)
);
CREATE TABLE inventory_balances (
 store_id uuid NOT NULL, sku_id uuid NOT NULL, on_hand bigint NOT NULL DEFAULT 0,
 reserved bigint NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,sku_id), FOREIGN KEY(store_id,sku_id) REFERENCES store_skus(store_id,sku_id),
 CHECK(on_hand >= reserved AND reserved >= 0)
);
CREATE TABLE carts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), store_id uuid NOT NULL REFERENCES stores(id),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CONVERTED')), version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_cart ON carts(user_id,store_id) WHERE status='ACTIVE';
CREATE TABLE cart_items (
 cart_id uuid NOT NULL REFERENCES carts(id), sku_id uuid NOT NULL REFERENCES skus(id),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000), PRIMARY KEY(cart_id,sku_id)
);
CREATE TABLE fulfillment_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES stores(id), method text NOT NULL DEFAULT 'PICKUP' CHECK(method='PICKUP'),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, capacity integer NOT NULL CHECK(capacity >= 0),
 allocated_count integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1,
 CHECK(starts_at < ends_at), CHECK(allocated_count BETWEEN 0 AND capacity), UNIQUE(id,store_id)
);
CREATE INDEX slots_store_time ON fulfillment_slots(store_id,starts_at);
CREATE TABLE vouchers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, store_id uuid REFERENCES stores(id),
 discount_type text NOT NULL CHECK(discount_type IN ('FIXED','PERCENT')), value bigint NOT NULL CHECK(value > 0),
 max_discount bigint CHECK(max_discount >= 0), min_total bigint NOT NULL DEFAULT 0 CHECK(min_total >= 0),
 quota integer NOT NULL CHECK(quota >= 0), allocated_count integer NOT NULL DEFAULT 0,
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, version integer NOT NULL DEFAULT 1,
 CHECK(valid_from < valid_until), CHECK(allocated_count BETWEEN 0 AND quota), CHECK(discount_type <> 'PERCENT' OR value <= 100)
);
CREATE TABLE checkout_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cart_id uuid NOT NULL REFERENCES carts(id), cart_version integer NOT NULL,
 pricing_version text NOT NULL, slot_id uuid NOT NULL REFERENCES fulfillment_slots(id), voucher_id uuid REFERENCES vouchers(id),
 totals jsonb NOT NULL, items jsonb NOT NULL, expires_at timestamptz NOT NULL, consumed_order_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, user_id uuid NOT NULL REFERENCES users(id),
 store_id uuid NOT NULL REFERENCES stores(id), slot_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING_PAYMENT','CONFIRMED','PICKING','READY','COMPLETED','CANCELLED','EXPIRED')),
 fulfillment_method text NOT NULL DEFAULT 'PICKUP' CHECK(fulfillment_method='PICKUP'),
 payment_method text NOT NULL CHECK(payment_method IN ('ONLINE','PAY_AT_PICKUP')),
 subtotal bigint NOT NULL CHECK(subtotal >= 0), discount bigint NOT NULL CHECK(discount >= 0), fee bigint NOT NULL DEFAULT 0 CHECK(fee >= 0),
 total bigint NOT NULL CHECK(total >= 0), version integer NOT NULL DEFAULT 1, expires_at timestamptz,
 completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(total=subtotal-discount+fee AND discount<=subtotal), UNIQUE(id,store_id), FOREIGN KEY(slot_id,store_id) REFERENCES fulfillment_slots(id,store_id)
);
ALTER TABLE checkout_quotes ADD CONSTRAINT quote_consumed_order_fk FOREIGN KEY(consumed_order_id) REFERENCES orders(id);
CREATE INDEX orders_store_status_time ON orders(store_id,status,created_at,id);
CREATE INDEX orders_user_time ON orders(user_id,created_at,id);
CREATE TABLE order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), sku_id uuid NOT NULL REFERENCES skus(id),
 sku_code text NOT NULL, name text NOT NULL, unit_price bigint NOT NULL CHECK(unit_price>=0), quantity integer NOT NULL CHECK(quantity>0),
 discount bigint NOT NULL DEFAULT 0 CHECK(discount>=0), line_total bigint NOT NULL CHECK(line_total>=0), picked_quantity integer NOT NULL DEFAULT 0,
 CHECK(picked_quantity BETWEEN 0 AND quantity), CHECK(line_total=unit_price*quantity-discount), UNIQUE(order_id,sku_id)
);
CREATE TABLE inventory_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, store_id uuid NOT NULL, sku_id uuid NOT NULL, quantity integer NOT NULL CHECK(quantity>0),
 status text NOT NULL CHECK(status IN ('ACTIVE','COMMITTED','CONSUMED','RELEASED')), expires_at timestamptz,
 UNIQUE(order_id,sku_id), FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id),
 FOREIGN KEY(store_id,sku_id) REFERENCES store_skus(store_id,sku_id), CHECK(status<>'ACTIVE' OR expires_at IS NOT NULL)
);
CREATE INDEX reservations_expiry ON inventory_reservations(status,expires_at);
CREATE TABLE stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, sku_id uuid NOT NULL,
 delta_on_hand bigint NOT NULL, delta_reserved bigint NOT NULL,
 reason text NOT NULL CHECK(reason IN ('RECEIPT','ADJUSTMENT','RESERVE','RELEASE','HANDOVER')),
 reference_id text NOT NULL, actor_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,sku_id) REFERENCES store_skus(store_id,sku_id), UNIQUE(store_id,sku_id,reason,reference_id)
);
CREATE TABLE slot_bookings (
 order_id uuid PRIMARY KEY REFERENCES orders(id), slot_id uuid NOT NULL REFERENCES fulfillment_slots(id),
 status text NOT NULL CHECK(status IN ('ACTIVE','RELEASED','FULFILLED'))
);
CREATE TABLE voucher_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL REFERENCES vouchers(id), order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
 user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL CHECK(status IN ('RESERVED','COMMITTED','RELEASED'))
);
CREATE TABLE picking_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), picker_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')), assigned_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX one_active_picker ON picking_assignments(order_id) WHERE status='ACTIVE';
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), provider text NOT NULL,
 provider_reference text NOT NULL, amount bigint NOT NULL CHECK(amount>=0), currency text NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
 status text NOT NULL CHECK(status IN ('INITIATED','PENDING','PAID','FAILED','EXPIRED')), paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,provider_reference)
);
CREATE TABLE payment_webhook_inbox (
 provider text NOT NULL, provider_event_id text NOT NULL, payload_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz, PRIMARY KEY(provider,provider_event_id)
);
CREATE TABLE counter_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL UNIQUE REFERENCES orders(id), amount bigint NOT NULL CHECK(amount>=0),
 method text NOT NULL CHECK(method='CASH'), collected_by uuid NOT NULL REFERENCES users(id), request_key text NOT NULL UNIQUE,
 collected_at timestamptz NOT NULL DEFAULT now(), shift_reference text NOT NULL
);
CREATE TABLE refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_attempt_id uuid NOT NULL REFERENCES payment_attempts(id),
 amount bigint NOT NULL CHECK(amount>0), reason text NOT NULL, status text NOT NULL CHECK(status IN ('REQUESTED','PROCESSING','SUCCEEDED','FAILED')),
 provider_reference text UNIQUE, succeeded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pickup_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), token_hash text NOT NULL UNIQUE,
 nonce text NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz
);
CREATE UNIQUE INDEX one_live_token ON pickup_tokens(order_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE TABLE order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), from_status text, to_status text NOT NULL,
 actor_id uuid REFERENCES users(id), reason text NOT NULL, request_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_id uuid NOT NULL, aggregate_version integer NOT NULL,
 type text NOT NULL, schema_version integer NOT NULL DEFAULT 1, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSED','DEAD')), attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE INDEX outbox_available ON outbox_events(status,available_at);
CREATE TABLE consumer_receipts (
 consumer text NOT NULL, event_id uuid NOT NULL REFERENCES outbox_events(id), processed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(consumer,event_id)
);
CREATE TABLE idempotency_records (
 principal_id uuid NOT NULL REFERENCES users(id), operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL,
 response jsonb NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(principal_id,operation,key)
);
CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id), action text NOT NULL, entity_type text NOT NULL,
 entity_id uuid NOT NULL, details jsonb NOT NULL DEFAULT '{}', request_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity ON audit_logs(entity_type,entity_id,created_at);
CREATE TABLE support_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), order_id uuid REFERENCES orders(id),
 category text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_issues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id), item_id uuid NOT NULL REFERENCES order_items(id),
 actor_id uuid NOT NULL REFERENCES users(id), quantity integer NOT NULL CHECK(quantity>0), category text NOT NULL CHECK(category IN ('MISSING','DAMAGED')),
 note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL UNIQUE REFERENCES outbox_events(id), user_id uuid NOT NULL REFERENCES users(id),
 channel text NOT NULL DEFAULT 'IN_APP' CHECK(channel='IN_APP'), payload jsonb NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), store_id uuid NOT NULL REFERENCES stores(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id),
 role text NOT NULL CHECK(role IN ('USER','ASSISTANT')), content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_tool_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES conversations(id), actor_id uuid NOT NULL REFERENCES users(id),
 tool text NOT NULL, input_hash text NOT NULL, status text NOT NULL, model_version text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE knowledge_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, source_uri text NOT NULL, version integer NOT NULL,
 effective_at timestamptz NOT NULL, status text NOT NULL CHECK(status IN ('DRAFT','APPROVED','RETIRED')), store_id uuid REFERENCES stores(id)
);
CREATE TABLE knowledge_chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES knowledge_documents(id), position integer NOT NULL,
 content text NOT NULL, UNIQUE(document_id,position)
);
CREATE TABLE recommendation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), store_id uuid NOT NULL REFERENCES stores(id),
 sku_id uuid NOT NULL REFERENCES skus(id), type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical records are append-only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER immutable_order_events BEFORE UPDATE OR DELETE ON order_events FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER immutable_stock_movements BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER immutable_audit_logs BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
