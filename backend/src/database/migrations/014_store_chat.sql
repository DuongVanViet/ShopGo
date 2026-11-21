CREATE TABLE store_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  last_message_id bigint NOT NULL DEFAULT 0,
  customer_read_through bigint NOT NULL DEFAULT 0,
  store_read_through bigint NOT NULL DEFAULT 0,
  UNIQUE(store_id,customer_id),
  CHECK(customer_read_through BETWEEN 0 AND last_message_id),
  CHECK(store_read_through BETWEEN 0 AND last_message_id)
);

CREATE INDEX store_chat_inbox ON store_chat_threads(store_id,last_message_id DESC)
  WHERE last_message_id > 0;
CREATE INDEX customer_chat_inbox ON store_chat_threads(customer_id,last_message_id DESC)
  WHERE last_message_id > 0;

CREATE TABLE store_chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES store_chat_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_side text NOT NULL CHECK(sender_side IN ('CUSTOMER','STORE')),
  body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX store_chat_history ON store_chat_messages(thread_id,id DESC);
