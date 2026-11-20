'use client';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Camera,
  CalendarClock,
  CheckCircle2,
  Image as ImageIcon,
  PackagePlus,
  Pencil,
  Plus,
  QrCode,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import { useShop } from '@/store/shop';
import type { Category, ManagedProduct, Page } from '@/types';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { ProductPrice } from '@/components/product-price';

function saleDate(value?: string | null) {
  return new Date((value ? new Date(value).getTime() : Date.now()) + 7 * 3600000)
    .toISOString()
    .slice(0, 16);
}
function DiscountFields({ product }: { product: ManagedProduct }) {
  const [enabled, setEnabled] = useState(!!product.salePrice);
  return (
    <fieldset className="product-discount-fields">
      <legend>Giảm giá trực tiếp</legend>
      <label className="seller-product-active-toggle">
        <input
          type="checkbox"
          name="saleEnabled"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Áp dụng giá giảm cho sản phẩm tại cửa hàng</span>
      </label>
      {enabled && (
        <>
          <label>
            Giá sau giảm (VND)
            <input
              name="salePrice"
              type="number"
              min={1}
              max={1000000000000}
              required
              defaultValue={product.salePrice ?? ''}
            />
          </label>
          <label>
            Bắt đầu giảm giá (giờ Việt Nam)
            <input
              name="saleStartsAt"
              type="datetime-local"
              required
              defaultValue={saleDate(product.saleStartsAt)}
            />
          </label>
          <label>
            Kết thúc giảm giá (giờ Việt Nam)
            <input
              name="saleEndsAt"
              type="datetime-local"
              required
              defaultValue={saleDate(
                product.saleEndsAt ?? new Date(Date.now() + 86400000).toISOString(),
              )}
            />
          </label>
          <p className="muted">
            Giá giảm áp dụng cho toàn bộ số lượng còn bán của mã hàng này tại cửa hàng. Hết thời
            gian áp dụng, sản phẩm trở về giá gốc.
          </p>
        </>
      )}
    </fieldset>
  );
}

const units = [
  ['piece', 'Cái / đơn vị'],
  ['pack', 'Gói'],
  ['box', 'Hộp'],
  ['bottle', 'Chai'],
  ['case', 'Thùng'],
  ['multipack', 'Lốc'],
  ['kg', 'Kilogram (kg)'],
  ['g', 'Gram (g)'],
  ['l', 'Lít (l)'],
  ['ml', 'Mililít (ml)'],
] as const;

function unitLabel(value: string) {
  return units.find(([unit]) => unit === value)?.[1] ?? value;
}

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageBytes = 5 * 1024 * 1024;

function validateProductImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) return 'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.';
  if (file.size > maxImageBytes) return 'Ảnh không được vượt quá 5 MB.';
  return '';
}

function ProductQrPreview({ onManual }: { onManual: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="seller-qr-preview">
      <p className="seller-qr-status">Sắp ra mắt</p>
      <p>Quét mã QR trên sản phẩm để điền thông tin nhanh.</p>
      <div className="seller-qr-frame" aria-label="Khung quét mã QR">
        {preview ? (
          <img src={preview} alt="Xem trước ảnh mã QR" />
        ) : (
          <>
            <QrCode size={84} strokeWidth={1.2} aria-hidden="true" />
            <span>Đặt mã QR vào trong khung</span>
          </>
        )}
      </div>
      <p className="muted" role="status">
        Giao diện xem trước. Chức năng nhận diện mã QR và tự điền thông tin sản phẩm sẽ sớm ra mắt.
      </p>
      <div className="seller-qr-actions">
        <button type="button" className="button secondary" disabled>
          <Camera size={18} />
          Quét bằng camera
        </button>
        <label className="button secondary seller-qr-upload">
          <ImageIcon size={18} />
          Chọn ảnh QR
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Chọn ảnh mã QR"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (!selected) return;
              const failure = validateProductImage(selected);
              setError(failure);
              if (!failure) setFile(selected);
              event.target.value = '';
            }}
          />
        </label>
      </div>
      <ErrorBox error={error ? new Error(error) : null} />
      {file && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setFile(null);
            setError('');
          }}
        >
          Bỏ ảnh QR
        </button>
      )}
      <button type="button" className="button wide" onClick={onManual}>
        Nhập thông tin thủ công
      </button>
    </div>
  );
}

function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function expiryDetails(expiresOn?: string | null) {
  if (!expiresOn) return null;
  const today = vietnamToday();
  const days = Math.round(
    (new Date(`${expiresOn}T00:00:00+07:00`).getTime() -
      new Date(`${today}T00:00:00+07:00`).getTime()) /
      86_400_000,
  );
  return {
    days,
    label: new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${expiresOn}T00:00:00+07:00`)),
  };
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
  const [createPanel, setCreatePanel] = useState<'category' | 'product' | 'qr' | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false),
    [categoryError, setCategoryError] = useState<unknown>(null),
    [productBusy, setProductBusy] = useState(false),
    [productError, setProductError] = useState<unknown>(null),
    [imageFile, setImageFile] = useState<File | null>(null),
    [imagePreview, setImagePreview] = useState(''),
    [imageValidationError, setImageValidationError] = useState(''),
    [uploadingProductId, setUploadingProductId] = useState(''),
    [imageActionError, setImageActionError] = useState<unknown>(null),
    [editingProduct, setEditingProduct] = useState<ManagedProduct | null>(null),
    [editBusy, setEditBusy] = useState(false),
    [editError, setEditError] = useState<unknown>(null),
    [writeOffProduct, setWriteOffProduct] = useState<ManagedProduct | null>(null),
    [writeOffBusy, setWriteOffBusy] = useState(false),
    [writeOffError, setWriteOffError] = useState<unknown>(null),
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
      setCreatePanel(null);
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
    setImageActionError(null);
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
          expiresOn: value('expiresOn') || null,
        },
      });
      let imageUploadFailed = false;
      if (imageFile) {
        try {
          await uploadProductImage(product.productId, imageFile);
        } catch (error) {
          imageUploadFailed = true;
          setImageActionError(
            new Error(
              `Sản phẩm đã được tạo nhưng chưa tải được ảnh. Bạn có thể thử lại tại danh sách bên dưới. ${
                error instanceof Error ? error.message : ''
              }`.trim(),
            ),
          );
        }
      }
      form.reset();
      setCreatePanel(null);
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

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProduct) return;
    const values = new FormData(event.currentTarget),
      value = (name: string) => String(values.get(name) ?? '');
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await api<ManagedProduct>(
        `${base}/catalog/products/${editingProduct.skuId}`,
        {
          method: 'PATCH',
          token: shop.token,
          idempotent: true,
          body: {
            name: value('name'),
            description: value('description'),
            categoryId: value('categoryId'),
            sku: {
              code: value('code'),
              barcode: value('barcode') || null,
              name: value('name'),
              unit: value('unit'),
            },
            price: Number(value('price')),
            active: values.get('active') === 'on',
            expiresOn: value('expiresOn') || null,
            expectedVersion: editingProduct.version,
            discount:
              values.get('saleEnabled') === 'on'
                ? {
                    price: Number(value('salePrice')),
                    startsAt: new Date(`${value('saleStartsAt')}:00+07:00`).toISOString(),
                    endsAt: new Date(`${value('saleEndsAt')}:00+07:00`).toISOString(),
                  }
                : null,
          },
        },
      );
      setEditingProduct(null);
      products.refresh();
      onProductCreated();
      shop.notice(`Đã cập nhật “${updated.name}”.`);
    } catch (error) {
      setEditError(error);
    } finally {
      setEditBusy(false);
    }
  }

  async function writeOffStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writeOffProduct) return;
    const values = new FormData(event.currentTarget);
    setWriteOffBusy(true);
    setWriteOffError(null);
    try {
      const quantity = Number(values.get('quantity'));
      const reason = String(values.get('reason')) as 'EXPIRED' | 'DAMAGED';
      await api(`${base}/inventory/${writeOffProduct.skuId}/write-offs`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: {
          quantity,
          reason,
          note: String(values.get('note') ?? '').trim() || undefined,
        },
      });
      const productName = writeOffProduct.name;
      setWriteOffProduct(null);
      products.refresh();
      onProductCreated();
      shop.notice(
        `Đã loại ${quantity} ${unitLabel(writeOffProduct.unit).toLowerCase()} ${productName} khỏi tồn kho.`,
      );
    } catch (error) {
      setWriteOffError(error);
    } finally {
      setWriteOffBusy(false);
    }
  }

  return (
    <section className="seller-catalog">
      <div className="seller-catalog-toolbar">
        <h2>Danh mục & sản phẩm</h2>
        <div className="seller-catalog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setCreatePanel('category')}
          >
            <Tags size={18} />
            Tạo danh mục
          </button>
          <button type="button" className="button secondary" onClick={() => setCreatePanel('qr')}>
            <QrCode size={18} />
            Quét QR
          </button>
          <button type="button" className="button" onClick={() => setCreatePanel('product')}>
            <Plus size={18} />
            Tạo sản phẩm
          </button>
        </div>
      </div>

      {created && (
        <div className="info-note seller-catalog-success" role="status">
          <CheckCircle2 size={18} />
          {created}
        </div>
      )}
      <Modal
        open={createPanel !== null}
        onClose={() => {
          if (categoryBusy || productBusy) return;
          setCreatePanel(null);
          setCategoryError(null);
          setProductError(null);
          setImageFile(null);
          setImageValidationError('');
        }}
        title={
          createPanel === 'category'
            ? 'Tạo danh mục'
            : createPanel === 'qr'
              ? 'Quét QR để tạo sản phẩm'
              : 'Tạo sản phẩm'
        }
      >
        {createPanel === 'qr' && <ProductQrPreview onManual={() => setCreatePanel('product')} />}
        {createPanel === 'category' && (
          <form
            className="form-stack seller-create-form"
            onSubmit={(event) => void createCategory(event)}
          >
            <p className="muted">Ví dụ: Trái cây, Đồ uống, Chăm sóc cá nhân.</p>
            <label>
              Tên danh mục
              <input
                name="name"
                required
                minLength={1}
                maxLength={100}
                placeholder="Nhập tên danh mục"
                autoFocus
              />
            </label>
            <ErrorBox error={categoryError} />
            <button className="button" disabled={categoryBusy}>
              <Plus size={17} />
              {categoryBusy ? 'Đang tạo…' : 'Lưu danh mục'}
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
        )}

        {createPanel === 'product' && (
          <form
            className="form-stack seller-create-form"
            onSubmit={(event) => void createProduct(event)}
          >
            <ErrorBox error={categories.error} retry={categories.refresh} />
            {!categories.loading && !categories.error && !categories.data?.length && (
              <div className="info-note">
                Hãy tạo ít nhất một danh mục trước khi thêm sản phẩm.{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setCreatePanel('category')}
                >
                  Tạo danh mục
                </button>
              </div>
            )}
            <label>
              Tên sản phẩm
              <input
                name="name"
                required
                maxLength={200}
                placeholder="Ví dụ: Táo xanh túi 500g"
                autoFocus
              />
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
            <div className="form-field">
              <label htmlFor="seller-product-expiry">Hạn sử dụng gần nhất (nếu có)</label>
              <input
                id="seller-product-expiry"
                name="expiresOn"
                type="date"
                aria-describedby="seller-product-expiry-hint"
              />
              <small id="seller-product-expiry-hint">
                Đến ngày này sản phẩm vẫn được bán; từ ngày tiếp theo hệ thống tự chặn bán.
              </small>
            </div>
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
        )}
      </Modal>

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
            <p>Bấm “Tạo danh mục” và “Tạo sản phẩm” để bắt đầu.</p>
          </Empty>
        ) : (
          <div className="seller-product-grid">
            {products.data.items.map((product) => (
              <article className="seller-product-card" key={product.skuId}>
                {(() => {
                  const expiry = expiryDetails(product.expiresOn);
                  return (
                    <div className="seller-product-status-row">
                      <span
                        className={`seller-product-status ${product.active ? 'active' : 'paused'}`}
                      >
                        {product.active ? 'Đang mở bán' : 'Đã tạm ngừng'}
                      </span>
                      {expiry && (
                        <span
                          className={`seller-product-status ${expiry.days < 0 ? 'expired' : expiry.days <= 7 ? 'expiring' : 'dated'}`}
                        >
                          <CalendarClock size={12} />
                          {expiry.days < 0
                            ? `Đã hết hạn ${expiry.label}`
                            : expiry.days === 0
                              ? `Hết hạn hôm nay · ${expiry.label}`
                              : `Hạn ${expiry.label}`}
                        </span>
                      )}
                    </div>
                  );
                })()}
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
                  <ProductPrice
                    price={
                      product.salePrice &&
                      product.saleStartsAt &&
                      product.saleEndsAt &&
                      new Date(product.saleStartsAt).getTime() <= Date.now() &&
                      new Date(product.saleEndsAt).getTime() > Date.now()
                        ? product.salePrice
                        : product.price
                    }
                    originalPrice={product.price}
                  />
                </div>
                <p>{product.description || 'Chưa có mô tả sản phẩm.'}</p>
                {product.salePrice && product.saleStartsAt && product.saleEndsAt && (
                  <p className="muted">
                    Giá giảm {money(product.salePrice)} · {dateTime(product.saleStartsAt)} –{' '}
                    {dateTime(product.saleEndsAt)}
                  </p>
                )}
                <div className="seller-product-meta">
                  <span>Đơn vị: {unitLabel(product.unit)}</span>
                  <span>Tồn: {product.onHand}</span>
                  <span>Có thể bán: {product.available}</span>
                  {product.barcode && <span>Mã vạch: {product.barcode}</span>}
                </div>
                <div className="seller-product-actions">
                  <button
                    type="button"
                    className="seller-product-edit-action"
                    onClick={() => {
                      setEditError(null);
                      setEditingProduct(product);
                    }}
                  >
                    <Pencil size={14} /> Chỉnh sửa thuộc tính
                  </button>
                  <button
                    type="button"
                    className="seller-product-writeoff-action"
                    disabled={product.available <= 0}
                    title={
                      product.available <= 0
                        ? 'Không còn số lượng khả dụng để loại khỏi tồn kho'
                        : undefined
                    }
                    onClick={() => {
                      setWriteOffError(null);
                      setWriteOffProduct(product);
                    }}
                  >
                    <Trash2 size={14} /> Loại hàng hỏng / hết hạn
                  </button>
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
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!editingProduct}
        onClose={() => {
          if (!editBusy) setEditingProduct(null);
        }}
        title="Chỉnh sửa sản phẩm"
      >
        {editingProduct && (
          <form
            key={`${editingProduct.skuId}:${editingProduct.version}`}
            className="form-stack seller-product-edit-form"
            onSubmit={(event) => void updateProduct(event)}
          >
            <div className="seller-product-edit-summary">
              <div className="seller-product-thumbnail">
                {editingProduct.imageUrl ? (
                  <img src={editingProduct.imageUrl} alt="" />
                ) : (
                  <ImageIcon size={22} />
                )}
              </div>
              <div>
                <strong>{editingProduct.name}</strong>
                <small>
                  Tồn thực tế: {editingProduct.onHand} · Đang giữ: {editingProduct.reserved}
                </small>
              </div>
            </div>
            <div className="grid-2">
              <label>
                Tên sản phẩm
                <input name="name" defaultValue={editingProduct.name} required maxLength={200} />
              </label>
              <label>
                Danh mục
                <select name="categoryId" defaultValue={editingProduct.categoryId} required>
                  {categories.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid-2">
              <label>
                Mã SKU
                <input
                  name="code"
                  defaultValue={editingProduct.code}
                  required
                  maxLength={100}
                  pattern="[A-Za-z0-9._-]+"
                />
              </label>
              <label>
                Mã vạch
                <input name="barcode" defaultValue={editingProduct.barcode ?? ''} maxLength={100} />
              </label>
            </div>
            <div className="grid-2">
              <label>
                Giá bán mới (VND)
                <input
                  name="price"
                  type="number"
                  min={1}
                  max={1000000000000}
                  step={1}
                  defaultValue={editingProduct.price}
                  required
                />
              </label>
              <label>
                Đơn vị bán
                <select name="unit" defaultValue={editingProduct.unit} required>
                  {units.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DiscountFields product={editingProduct} />
            <div className="form-field">
              <label htmlFor="seller-edit-product-expiry">Hạn sử dụng gần nhất</label>
              <input
                id="seller-edit-product-expiry"
                name="expiresOn"
                type="date"
                defaultValue={editingProduct.expiresOn ?? ''}
                aria-describedby="seller-edit-product-expiry-hint"
              />
              <small id="seller-edit-product-expiry-hint">
                Để trống nếu chưa quản lý hạn. Sản phẩm quá hạn sẽ tự biến mất khỏi cửa hàng và bị
                chặn khi thanh toán.
              </small>
            </div>
            <label>
              Mô tả chi tiết
              <textarea
                name="description"
                defaultValue={editingProduct.description}
                maxLength={5000}
                rows={4}
              />
            </label>
            <label className="seller-product-active-toggle">
              <input name="active" type="checkbox" defaultChecked={editingProduct.active} />
              <span>
                <strong>Cho phép mở bán</strong>
                <small>Tắt mục này để ẩn sản phẩm ngay cả khi vẫn còn tồn kho.</small>
              </span>
            </label>
            <div className="info-note seller-product-stock-note">
              Tồn kho không sửa trong form này để bảo toàn lịch sử nhập/xuất. Hãy dùng phần “Tồn
              kho” để điều chỉnh số lượng và ghi lý do.
            </div>
            <ErrorBox error={editError} />
            <div className="row seller-product-edit-footer">
              <button
                type="button"
                className="button secondary"
                disabled={editBusy}
                onClick={() => setEditingProduct(null)}
              >
                Hủy
              </button>
              <button className="button" disabled={editBusy}>
                <CheckCircle2 size={17} /> {editBusy ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!writeOffProduct}
        onClose={() => {
          if (!writeOffBusy) setWriteOffProduct(null);
        }}
        title="Loại hàng khỏi tồn kho"
      >
        {writeOffProduct && (
          <form
            key={writeOffProduct.skuId}
            className="form-stack seller-product-writeoff-form"
            onSubmit={(event) => void writeOffStock(event)}
          >
            <div className="seller-product-edit-summary">
              <div className="seller-product-thumbnail">
                {writeOffProduct.imageUrl ? (
                  <img src={writeOffProduct.imageUrl} alt="" />
                ) : (
                  <Trash2 size={22} />
                )}
              </div>
              <div>
                <strong>{writeOffProduct.name}</strong>
                <small>
                  Tồn thực tế: {writeOffProduct.onHand} · Đang giữ cho đơn:{' '}
                  {writeOffProduct.reserved} · Có thể loại: {writeOffProduct.available}
                </small>
              </div>
            </div>
            <div className="grid-2">
              <label>
                Lý do
                <select name="reason" defaultValue="EXPIRED" required>
                  <option value="EXPIRED">Hết hạn sử dụng</option>
                  <option value="DAMAGED">Hư hỏng</option>
                </select>
              </label>
              <label>
                Số lượng loại ({unitLabel(writeOffProduct.unit).toLowerCase()})
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={writeOffProduct.available}
                  step={1}
                  defaultValue={1}
                  required
                />
              </label>
            </div>
            <label>
              Ghi chú (không bắt buộc)
              <textarea
                name="note"
                maxLength={500}
                rows={3}
                placeholder="Ví dụ: thùng bị móp khi vận chuyển, 3 lốc hết hạn…"
              />
            </label>
            <div className="info-note seller-product-writeoff-note">
              Hệ thống chỉ trừ phần hàng đang khả dụng. Số lượng đã giữ cho đơn hàng của khách sẽ
              không bị ảnh hưởng, và thao tác này được ghi vào lịch sử kho.
            </div>
            <ErrorBox error={writeOffError} />
            <div className="row seller-product-edit-footer">
              <button
                type="button"
                className="button secondary"
                disabled={writeOffBusy}
                onClick={() => setWriteOffProduct(null)}
              >
                Hủy
              </button>
              <button className="button danger" disabled={writeOffBusy}>
                <Trash2 size={17} />
                {writeOffBusy ? 'Đang cập nhật…' : 'Xác nhận loại khỏi kho'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
