ALTER TABLE vouchers ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE INDEX vouchers_store_window ON vouchers(store_id, valid_until) WHERE active;
ALTER TABLE orders ADD COLUMN voucher_code text;
UPDATE orders o SET voucher_code=v.code
FROM voucher_redemptions r JOIN vouchers v ON v.id=r.voucher_id WHERE r.order_id=o.id;
