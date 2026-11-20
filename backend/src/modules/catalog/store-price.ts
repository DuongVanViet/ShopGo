// All storefront and checkout queries use the store_skus alias ss.
export const storePrice = `CASE WHEN ss.sale_price IS NOT NULL
  AND ss.sale_starts_at<=statement_timestamp() AND ss.sale_ends_at>statement_timestamp()
  THEN ss.sale_price ELSE ss.price END`;
export const storePriceFields = `${storePrice} AS price, ss.price AS original_price`;
