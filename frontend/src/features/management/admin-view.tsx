'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Plus, UsersRound } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import type { Category } from '@/types';
import { AccessGate, ErrorBox, PageTitle } from '@/components/ui';

export function AdminView() {
  const shop = useShop(),
    [tab, setTab] = useState('product'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [result, setResult] = useState('');
  const categories = useResource<Category[]>('/categories');
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form),
      get = (name: string) => String(values.get(name) ?? '');
    let path = '',
      body: unknown;
    if (tab === 'product') {
      path = '/admin/products';
      body = {
        name: get('name'),
        description: get('description'),
        sku: {
          code: get('code'),
          name: get('name'),
          unit: get('unit') || 'piece',
          ...(get('barcode') ? { barcode: get('barcode') } : {}),
        },
        storeId: shop.store?.id,
        price: Number(get('price')),
        initialStock: Number(get('initialStock')),
        ...(get('categoryId') ? { categoryId: get('categoryId') } : {}),
      };
    } else if (tab === 'store') {
      path = '/admin/stores';
      body = { code: get('code'), name: get('name'), address: get('address') };
    } else if (tab === 'category') {
      path = '/admin/categories';
      body = { name: get('name'), slug: get('slug') };
    } else if (tab === 'membership') {
      path = '/admin/memberships';
      body = { userId: get('userId'), storeId: shop.store?.id, role: get('role') };
    } else {
      path = '/admin/vouchers';
      body = {
        code: get('code'),
        storeId: shop.store?.id,
        discountType: get('discountType'),
        value: Number(get('value')),
        minTotal: Number(get('minTotal')),
        quota: Number(get('quota')),
        validFrom: `${get('validFrom')}:00+07:00`,
        validUntil: `${get('validUntil')}:00+07:00`,
        ...(get('maxDiscount') ? { maxDiscount: Number(get('maxDiscount')) } : {}),
      };
    }
    setBusy(true);
    setError(null);
    setResult('');
    try {
      await api(path, { method: 'POST', token: shop.token, idempotent: true, body });
      setResult('Đã lưu dữ liệu thành công. Bạn có thể kiểm tra tại cửa hàng tương ứng.');
      shop.notice('Dữ liệu đã được lưu.');
      if (tab === 'category') categories.refresh();
      if (tab === 'store') await shop.refreshStores();
      form.reset();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessGate admin>
      <div className="container">
        <PageTitle
          eyebrow="QUẢN TRỊ HỆ THỐNG"
          title="Thêm dữ liệu, mở rộng trải nghiệm."
          subtitle="Tạo sản phẩm và dữ liệu thật để thử các luồng mua sắm, giữ tồn và vận hành."
          action={
            <Link className="button secondary small" href="/quan-ly">
              <UsersRound size={16} />
              Cấp tài khoản nhân viên
            </Link>
          }
        />
        <div className="panel management-store-bar">
          <div>
            <small>CỬA HÀNG ĐANG QUẢN TRỊ</small>
            <strong>{shop.store?.name ?? 'Chưa chọn cửa hàng'}</strong>
            {shop.store && <span>{shop.store.address}</span>}
          </div>
          <label>
            Chọn cửa hàng quản trị
            <select
              aria-label="Chọn cửa hàng quản trị"
              value={shop.store?.id ?? ''}
              onChange={(event) =>
                shop.setStore(shop.stores.find((store) => store.id === event.target.value) ?? null)
              }
            >
              <option value="" disabled>
                Chọn cửa hàng
              </option>
              {shop.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ErrorBox
          error={shop.storesError ? new Error(shop.storesError) : null}
          retry={() => void shop.refreshStores()}
        />
        <div className="filters">
          {[
            ['product', 'Sản phẩm'],
            ['category', 'Danh mục'],
            ['store', 'Cửa hàng'],
            ['voucher', 'Voucher'],
            ['membership', 'Phân quyền'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`filter-button ${tab === value ? 'active' : ''}`}
              onClick={() => {
                setTab(value);
                setError(null);
                setResult('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="checkout-grid">
          <form
            key={tab}
            className="panel form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget);
            }}
          >
            <h2 style={{ fontSize: 22 }}>
              {tab === 'product'
                ? 'Thêm sản phẩm mới'
                : tab === 'store'
                  ? 'Tạo cửa hàng'
                  : tab === 'category'
                    ? 'Tạo danh mục'
                    : tab === 'voucher'
                      ? 'Tạo mã ưu đãi'
                      : 'Cấp vai trò theo cửa hàng'}
            </h2>
            {['product', 'voucher', 'membership'].includes(tab) && (
              <div className="info-note">
                Áp dụng tại:{' '}
                <strong>{shop.store?.name ?? 'Chọn cửa hàng quản trị phía trên'}</strong>
              </div>
            )}
            {tab === 'product' && (
              <>
                <label>
                  Tên sản phẩm
                  <input name="name" required maxLength={200} placeholder="Ví dụ: Táo xanh 500g" />
                </label>
                <div className="grid-2">
                  <label>
                    Mã SKU
                    <input name="code" required maxLength={100} placeholder="TAO-XANH-500" />
                  </label>
                  <label>
                    Mã vạch
                    <input name="barcode" maxLength={100} placeholder="Mã để nhân viên kiểm tra" />
                  </label>
                </div>
                <label>
                  Danh mục
                  <select name="categoryId">
                    <option value="">Chưa phân loại</option>
                    {categories.data?.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid-2">
                  <label>
                    Giá bán (VND)
                    <input name="price" type="number" min={0} max={1000000000000} required />
                  </label>
                  <label>
                    Tồn ban đầu
                    <input name="initialStock" type="number" min={0} max={1000000000} required />
                  </label>
                </div>
                <label>
                  Đơn vị
                  <input name="unit" defaultValue="piece" maxLength={30} required />
                </label>
                <label>
                  Mô tả
                  <textarea name="description" maxLength={5000} />
                </label>
              </>
            )}
            {tab === 'store' && (
              <>
                <label>
                  Mã cửa hàng
                  <input name="code" required minLength={2} maxLength={40} />
                </label>
                <label>
                  Tên cửa hàng
                  <input name="name" required maxLength={200} />
                </label>
                <label>
                  Địa chỉ
                  <input name="address" required maxLength={500} />
                </label>
              </>
            )}
            {tab === 'category' && (
              <>
                <label>
                  Tên danh mục
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Slug không dấu
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9-]+"
                    maxLength={100}
                    placeholder="trai-cay"
                  />
                </label>
              </>
            )}
            {tab === 'membership' && (
              <>
                <label>
                  ID người dùng
                  <input name="userId" required placeholder="UUID từ hồ sơ tài khoản" />
                </label>
                <label>
                  Vai trò
                  <select name="role">
                    <option value="PICKER">Nhân viên soạn hàng</option>
                    <option value="COUNTER">Nhân viên quầy nhận</option>
                    <option value="MANAGER">Quản lý cửa hàng</option>
                  </select>
                </label>
                <small>Membership không tự cấp quyền admin hoặc hoàn tiền.</small>
              </>
            )}
            {tab === 'voucher' && (
              <>
                <label>
                  Mã voucher
                  <input name="code" required pattern="[A-Za-z0-9_-]{2,40}" placeholder="CHAOBAN" />
                </label>
                <div className="grid-2">
                  <label>
                    Hình thức
                    <select name="discountType">
                      <option value="FIXED">Giảm tiền cố định</option>
                      <option value="PERCENT">Giảm theo phần trăm</option>
                    </select>
                  </label>
                  <label>
                    Giá trị
                    <input name="value" type="number" min={1} max={1000000000000} required />
                  </label>
                </div>
                <div className="grid-2">
                  <label>
                    Đơn tối thiểu
                    <input
                      name="minTotal"
                      type="number"
                      min={0}
                      max={1000000000000}
                      defaultValue={0}
                      required
                    />
                  </label>
                  <label>
                    Giảm tối đa
                    <input name="maxDiscount" type="number" min={0} max={1000000000000} />
                  </label>
                </div>
                <label>
                  Số lượt
                  <input
                    name="quota"
                    type="number"
                    min={1}
                    max={1000000}
                    defaultValue={100}
                    required
                  />
                </label>
                <div className="grid-2">
                  <label>
                    Hiệu lực từ
                    <input type="datetime-local" name="validFrom" required />
                  </label>
                  <label>
                    Đến
                    <input type="datetime-local" name="validUntil" required />
                  </label>
                </div>
              </>
            )}
            <ErrorBox error={error} />
            {result && (
              <div className="info-note" role="status">
                <CheckCircle2 size={18} style={{ marginBottom: 7 }} />
                {result}
              </div>
            )}
            <button
              className="button"
              disabled={busy || (['product', 'voucher', 'membership'].includes(tab) && !shop.store)}
            >
              <Plus size={18} />
              {busy ? 'Đang lưu…' : 'Tạo dữ liệu'}
            </button>
          </form>
          <aside className="panel stack">
            <h2 style={{ fontSize: 21 }}>Một vài lưu ý nhỏ</h2>
            <p className="muted">
              SKU, barcode, mã cửa hàng và voucher cần duy nhất. Sản phẩm mới được mở bán và tạo số
              dư tồn tại cửa hàng đang chọn.
            </p>
            <div className="info-note">
              Sau khi thêm sản phẩm, chuyển tài khoản Khách hàng và tìm theo tên để bắt đầu một vòng
              đơn mới.
            </div>
            <p className="muted">
              Cửa hàng mới cần có nhân sự được cấp vai trò và khung giờ nhận trước khi vận hành.
            </p>
            <details>
              <summary className="details-summary">ID tài khoản đang đăng nhập</summary>
              <p className="token-value">{shop.user?.id}</p>
            </details>
          </aside>
        </div>
      </div>
    </AccessGate>
  );
}
