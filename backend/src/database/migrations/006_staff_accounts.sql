ALTER TABLE users DROP CONSTRAINT users_account_type_check;
ALTER TABLE users
  ADD CONSTRAINT users_account_type_check CHECK(account_type IN ('USER','SELLER','STAFF'));

ALTER TABLE users ADD COLUMN created_by_user_id uuid REFERENCES users(id);
CREATE INDEX users_created_by ON users(created_by_user_id);
