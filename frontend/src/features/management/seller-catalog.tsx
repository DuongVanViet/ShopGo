'use client';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Boxes,
  CheckCircle2,
  Image as ImageIcon,
  PackagePlus,
  Plus,
  Tags,
  Upload,
  X,
} from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useShop } from '@/store/shop';
import type { Category, ManagedProduct, Page } from '@/types';
import { Empty, ErrorBox, Loading } from '@/components/ui';

const units = [
  ['piece', 'Cái / đơn vị'],
  ['pack', 'Gói'],
  ['box', 'Hộp'],
  ['bottle', 'Chai'],
  ['kg', 'Kilogram (kg)'],
  ['g', 'Gram (g)'],
  ['l', 'Lít (l)'],
  ['ml', 'Mililít (ml)'],
] as const;

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageBytes = 5 * 1024 * 1024;

function validateProductImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) return 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.';
  if (file.size > maxImageBytes) return 'Ảnh không được vượt quá 5 MB.';
  return '';
}

export function SellerCatalog({
  base,
  onProductCreated,
}: {
  base: string;
  onProductCreated: () => void;
}) {
  const shop = useShop();
  const categories = useResource<Category[]>(`${base}/catalog/categories`);
  const products = useResource<Page<ManagedProduct>>(`${base}/catalog/products?limit=100`);
  const [categoryId, setCategoryId] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false),
    [categoryError, setCategoryError] = useState<unknown>(null),
    [productBusy, setProductBusy] = useState(false),
    [productError, setProductError] = useState<unknown>(null),
    [imageFile, setImageFile] = useState<File | null>(null),
    [imagePreview, setImagePreview] = useState(''),
    [imageValidationError, setImageValidationError] = useState(''),
    [uploadingProductId, setUploadingProductId] = useState(''),
    [imageActionError, setImageActionError] = useState<unknown>(null),
    [created, setCreated] = useState('');

  useEffect(() => {
    if (!categoryId && categories.data?.[0]) setCategoryId(categories.data[0].id);
  }, [categories.data, categoryId]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return;
    }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile]);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setImageFile(null);
      setImageValidationError('');
      return;
    }
    const error = validateProductImage(file);
    if (error) {
      event.target.value = '';
      setImageFile(null);
      setImageValidationError(error);
      return;
    }
    setImageValidationError('');
    setImageFile(file);
  }

  async function uploadProductImage(productId: string, file: File) {
    const body = new FormData();
    body.append('image', file);
    return api<{ imageUrl: string }>(`${base}/catalog/products/${productId}/image`, {
      method: 'POST',
      token: shop.token,
      body,
    });
  }

  async function replaceProductImage(
    product: ManagedProduct,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const validationError = validateProductImage(file);
    if (validationError) {
      setImageActionError(new Error(validationError));
      input.value = '';
      return;
    }
    setUploadingProductId(product.productId);
    setImageActionError(null);
    try {
      await uploadProductImage(product.productId, file);
      products.refresh();
      shop.notice(product.imageUrl ? 'Đã thay ảnh sản phẩm.' : 'Đã thêm ảnh sản phẩm.');
    } catch (error) {
      setImageActionError(error);
    } finally {
      input.value = '';
      setUploadingProductId('');
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setCategoryBusy(true);
    setCategoryError(null);
    setCreated('');
    try {
      const category = await api<Category>(`${base}/catalog/categories`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { name: String(values.get('name') ?? '') },
      });
      form.reset();
      setCategoryId(category.id);
      setCreated(`Đã tạo danh mục “${category.name}”.`);
      categories.refresh();
      shop.notice('Đã thêm danh mục cho cửa hàng.');
    } catch (error) {
      setCategoryError(error);
    } finally {
      setCategoryBusy(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form),
      value = (name: string) => String(values.get(name) ?? '');
    setProductBusy(true);
    setProductError(null);
    setCreated('');
    try {
      const product = await api<ManagedProduct>(`${base}/catalog/products`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: {
          name: value('name'),
          description: value('description'),
          categoryId,
          sku: {
            code: value('code'),
            name: value('name'),
            unit: value('unit'),
            ...(value('barcode') ? { barcode: value('barcode') } : {}),
          },
          price: Number(value('price')),
          initialStock: Number(value('initialStock')),
        },
      });
      let imageUploadFailed = false;
      if (imageFile) {
        try {
          await uploadProductImage(product.productId, imageFile);
        } catch (error) {
          imageUploadFailed = true;
          setProductError(
            new Error(
              `Sản phẩm đã được tạo nhưng chưa tải được ảnh. Bạn có thể thử lại tại danh sách bên dưới. ${
                error instanceof Error ? error.message : ''
              }`.trim(),
            ),
          );
        }
      }
      form.reset();
      setImageFile(null);
      setImageValidationError('');
      setCreated(
        imageUploadFailed
          ? `Đã thêm “${product.name}”; ảnh đang chờ bạn tải lại.`
          : `Đã thêm “${product.name}”${imageFile ? ' cùng ảnh đại diện' : ''} và mở bán tại ${shop.store?.name}.`,
      );
      products.refresh();
      onProductCreated();
      shop.notice(
        imageUploadFailed
          ? 'Đã thêm sản phẩm, nhưng ảnh cần được tải lại.'
          : 'Sản phẩm đã được thêm vào cửa hàng.',
        imageUploadFailed,
      );
    } catch (error) {
      setProductError(error);
    } finally {
      setProductBusy(false);
    }
  }

  return (
    <section className="seller-catalog">
      <div className="seller-catalog-intro">
        <div>
          <p className="eyebrow">DANH MỤC CỦA CỬA HÀNG</p>
          <h2>Đưa sản phẩm đầu tiên lên ShopGo.</h2>
          <p className="muted">
            Tạo danh mục, khai báo mã hàng, giá bán và tồn ban đầu. Khách sẽ thấy sản phẩm ngay tại
            cửa hàng đang chọn.
          </p>
        </div>
        <span>
          <PackagePlus size={28} />
        </span>
      </div>

      {created && (
        <div className="info-note seller-catalog-success" role="status">
          <CheckCircle2 size={18} />
          {created}
        </div>
      )}
      <div className="seller-catalog-forms">
        <form className="panel form-stack" onSubmit={(event) => void createCategory(event)}>
          <h3 className="form-section-title">
            <Tags size={19} />
            1. Thêm danh mục
          </h3>
          <p className="muted">Ví dụ: Trái cây, Đồ uống, Chăm sóc cá nhân.</p>
          <label>
            Tên danh mục
            <input
              name="name"
              required
              minLength={1}
              maxLength={100}
              placeholder="Nhập tên danh mục"
            />
          </label>
          <ErrorBox error={categoryError} />
          <button className="button" disabled={categoryBusy}>
            <Plus size={17} />
            {categoryBusy ? 'Đang tạo…' : 'Tạo danh mục'}
          </button>
          <div className="seller-category-list" aria-label="Danh mục có thể sử dụng">
            {categories.loading && !categories.data ? (
              <Loading label="Đang tải danh mục…" />
            ) : (
              categories.data?.map((category) => (
                <button
                  type="button"
                  className={categoryId === category.id ? 'active' : ''}
                  key={category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))
            )}
          </div>
          <ErrorBox error={categories.error} retry={categories.refresh} />
        </form>

        <form className="panel form-stack" onSubmit={(event) => void createProduct(event)}>
          <h3 className="form-section-title">
            <Boxes size={19} />
            2. Thêm sản phẩm
          </h3>
          {!categories.loading && !categories.data?.length && (
            <div className="info-note">Hãy tạo ít nhất một danh mục trước khi thêm sản phẩm.</div>
          )}
          <label>
            Tên sản phẩm
            <input name="name" required maxLength={200} placeholder="Ví dụ: Táo xanh túi 500g" />
          </label>
          <label>
            Danh mục
            <select
              aria-label="Danh mục sản phẩm"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required
            >
              <option value="" disabled>
                Chọn danh mục
              </option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid-2">
            <div className="form-field">
              <label htmlFor="seller-product-sku">Mã SKU</label>
              <input
                id="seller-product-sku"
                name="code"
                required
                maxLength={100}
                pattern="[A-Za-z0-9._-]+"
                aria-describedby="seller-product-sku-hint"
                placeholder="TAO-XANH-500"
              />
              <small id="seller-product-sku-hint">
                Chỉ dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.
              </small>
            </div>
            <label>
              Mã vạch (nếu có)
              <input name="barcode" maxLength={100} placeholder="893…" inputMode="numeric" />
            </label>
          </div>
          <div className="grid-2">
            <label>
              Giá bán (VND)
              <input name="price" type="number" min={1} max={1000000000000} step={1} required />
            </label>
            <label>
              Tồn ban đầu
              <input
                name="initialStock"
                type="number"
                min={0}
                max={1000000000}
                step={1}
                defaultValue={0}
                required
              />
            </label>
          </div>
          <label>
            Đơn vị bán
            <select name="unit" defaultValue="piece" required>
              {units.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mô tả chi tiết
            <textarea
              name="description"
              maxLength={5000}
              rows={4}
              placeholder="Quy cách đóng gói, đặc điểm, hướng dẫn bảo quản…"
            />
          </label>
          <div className="form-field seller-image-field">
            <span>Ảnh sản phẩm</span>
            <input
              className="seller-image-input"
              id="seller-product-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Ảnh sản phẩm"
              aria-describedby="seller-product-image-hint"
              onChange={selectImage}
            />
            {imagePreview ? (
              <div className="seller-image-preview">
                <img src={imagePreview} alt="Xem trước ảnh sản phẩm" />
                <div>
                  <strong>{imageFile?.name}</strong>
                  <small>
                    {imageFile ? `${(imageFile.size / 1024 / 1024).toFixed(2)} MB` : ''}
                  </small>
                </div>
                <button
                  type="button"
                  aria-label="Bỏ ảnh đã chọn"
                  onClick={() => {
                    setImageFile(null);
                    setImageValidationError('');
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            ) : (
              <label className="seller-image-dropzone" htmlFor="seller-product-image">
                <ImageIcon size={24} />
                <span>
                  <strong>Chọn ảnh từ máy</strong>
                  <small>Ảnh rõ, nền sáng sẽ giúp khách dễ chọn mua hơn.</small>
                </span>
                <Upload size={18} />
              </label>
            )}
            <small id="seller-product-image-hint">JPEG, PNG hoặc WebP · tối đa 5 MB.</small>
            <ErrorBox error={imageValidationError ? new Error(imageValidationError) : null} />
          </div>
          <ErrorBox error={productError} />
          <button className="button" disabled={productBusy || !categoryId}>
            <PackagePlus size={17} />
            {productBusy ? 'Đang lưu…' : 'Thêm sản phẩm vào cửa hàng'}
          </button>
        </form>
      </div>

      <div className="panel seller-product-section">
        <div className="panel-heading">
          <div>
            <h2>Sản phẩm đang quản lý</h2>
            <small>Tối đa 100 sản phẩm mới nhất theo trang hiện tại</small>
          </div>
          <span className="badge">{products.data?.items.length ?? 0} sản phẩm</span>
        </div>
        <ErrorBox error={products.error} retry={products.refresh} />
        <ErrorBox error={imageActionError} />
        {products.loading && !products.data ? (
          <Loading label="Đang tải sản phẩm…" />
        ) : !products.data?.items.length ? (
          <Empty title="Cửa hàng chưa có sản phẩm">
            <p>Tạo danh mục rồi thêm sản phẩm đầu tiên bằng biểu mẫu phía trên.</p>
          </Empty>
        ) : (
          <div className="seller-product-grid">
            {products.data.items.map((product) => (
              <article className="seller-product-card" key={product.skuId}>
                <div className="seller-product-card-heading">
                  <div className="seller-product-thumbnail">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={`Ảnh ${product.name}`} />
                    ) : (
                      <ImageIcon size={22} />
                    )}
                  </div>
                  <div>
                    <small>{product.categoryName}</small>
                    <h3>{product.name}</h3>
                    <code>{product.code}</code>
                  </div>
                  <strong>{money(product.price)}</strong>
                </div>
                <p>{product.description || 'Chưa có mô tả sản phẩm.'}</p>
                <div className="seller-product-meta">
                  <span>Đơn vị: {product.unit}</span>
                  <span>Tồn: {product.onHand}</span>
                  <span>Có thể bán: {product.available}</span>
                  {product.barcode && <span>Mã vạch: {product.barcode}</span>}
                </div>
                <label className="seller-product-image-action">
                  <Upload size={14} />
                  {uploadingProductId === product.productId
                    ? 'Đang tải ảnh…'
                    : product.imageUrl
                      ? 'Đổi ảnh'
                      : 'Thêm ảnh'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`${product.imageUrl ? 'Đổi' : 'Thêm'} ảnh cho ${product.name}`}
                    disabled={uploadingProductId === product.productId}
                    onChange={(event) => void replaceProductImage(product, event)}
                  />
                </label>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
