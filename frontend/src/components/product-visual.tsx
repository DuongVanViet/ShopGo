import { ProductArt } from '@/components/product-art';
import type { Product } from '@/types';

export function ProductVisual({
  product,
  large = false,
}: {
  product: Pick<Product, 'name' | 'imageUrl'>;
  large?: boolean;
}) {
  if (product.imageUrl) {
    return (
      <img
        className={`product-uploaded-image${large ? ' product-uploaded-image-large' : ''}`}
        src={product.imageUrl}
        alt={product.name}
      />
    );
  }
  return <ProductArt name={product.name} large={large} />;
}
