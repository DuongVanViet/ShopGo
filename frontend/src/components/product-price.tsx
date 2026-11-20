import { money } from '@/lib/format';

export function ProductPrice({
  price,
  originalPrice,
}: {
  price: number;
  originalPrice?: number | null;
}) {
  if (!originalPrice || originalPrice <= price) return <strong>{money(price)}</strong>;
  return (
    <span className="product-prices">
      <del aria-label={`Giá gốc ${money(originalPrice)}`}>{money(originalPrice)}</del>
      <strong aria-label={`Giá giảm ${money(price)}`}>{money(price)}</strong>
    </span>
  );
}
