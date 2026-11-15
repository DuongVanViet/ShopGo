ALTER TABLE orders ADD COLUMN payment_plan text;
ALTER TABLE orders ADD COLUMN deposit_percent smallint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN deposit_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN amount_due_now bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN remaining_amount bigint NOT NULL DEFAULT 0;

UPDATE orders
SET payment_plan = CASE
    WHEN payment_method = 'ONLINE' THEN 'FULL_ONLINE'
    ELSE 'LEGACY_PAY_AT_PICKUP'
  END,
  amount_due_now = CASE WHEN payment_method = 'ONLINE' THEN total ELSE 0 END,
  remaining_amount = CASE WHEN payment_method = 'PAY_AT_PICKUP' THEN total ELSE 0 END;

ALTER TABLE orders ALTER COLUMN payment_plan SET NOT NULL;
ALTER TABLE orders ALTER COLUMN deposit_percent DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN deposit_amount DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN amount_due_now DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN remaining_amount DROP DEFAULT;

ALTER TABLE orders ADD CONSTRAINT order_payment_terms CHECK (
  deposit_percent BETWEEN 0 AND 100
  AND deposit_amount BETWEEN 0 AND total
  AND amount_due_now BETWEEN 0 AND total
  AND remaining_amount BETWEEN 0 AND total
  AND amount_due_now + remaining_amount = total
  AND (
    (payment_plan = 'FULL_ONLINE' AND payment_method = 'ONLINE'
      AND deposit_percent = 0 AND deposit_amount = 0
      AND amount_due_now = total AND remaining_amount = 0)
    OR
    (payment_plan = 'DEPOSIT_15' AND payment_method = 'PAY_AT_PICKUP'
      AND deposit_percent = 15 AND deposit_amount = amount_due_now
      AND deposit_amount = (total * 15 + 99) / 100
      AND remaining_amount = total - deposit_amount)
    OR
    (payment_plan = 'LEGACY_PAY_AT_PICKUP' AND payment_method = 'PAY_AT_PICKUP'
      AND deposit_percent = 0 AND deposit_amount = 0
      AND amount_due_now = 0 AND remaining_amount = total)
  )
);
