CREATE TABLE order_chat_threads (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  last_message_id bigint NOT NULL DEFAULT 0,
  customer_read_through bigint NOT NULL DEFAULT 0,
  store_read_through bigint NOT NULL DEFAULT 0,
  CHECK(customer_read_through BETWEEN 0 AND last_message_id),
  CHECK(store_read_through BETWEEN 0 AND last_message_id)
);

CREATE TABLE order_chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES order_chat_threads(order_id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_side text NOT NULL CHECK(sender_side IN ('CUSTOMER','STORE')),
  body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
  request_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(order_id,sender_id,request_key)
);

CREATE INDEX order_chat_recent ON order_chat_threads(last_message_id DESC) WHERE last_message_id > 0;
CREATE INDEX order_chat_history ON order_chat_messages(order_id,id DESC);

CREATE FUNCTION delete_closed_order_chat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM order_chat_threads WHERE order_id=NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delete_closed_order_chat
AFTER UPDATE OF status ON orders FOR EACH ROW
WHEN (NEW.status IN ('COMPLETED','CANCELLED','EXPIRED') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION delete_closed_order_chat();
