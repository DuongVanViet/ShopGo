'use client';
import { useEffect, useState } from 'react';
import { Banknote, Boxes, CalendarClock, ClipboardCheck, RefreshCw, Wallet } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, messageOf, query } from '@/lib/api';
import { canAccessStoreRole } from '@/lib/access';
import { dateTime, localDate, money, shortCode } from '@/lib/format';
import type { Inventory, Order, Page, Product, Report, Slot } from '@/types';
import { AccessGate, Badge, Empty, ErrorBox, Loading, Modal, PageTitle } from '@/components/ui';
import { SellerLocationLink } from '@/features/auth/seller-location';
import { SellerCatalog } from '@/features/management/seller-catalog';
import { StaffManagement } from '@/features/management/staff-management';

export function ManagerView() {
  const shop = useShop(),
    [tab, setTab] = useState(shop.user?.isAdmin ? 'staff' : 'catalog'),
    [search, setSearch] = useState(''),
    [cursor, setCursor] = useState(''),
    [low, setLow] = useState(false),
    [editing, setEditing] = useState<Inventory | null>(null),
    [delta, setDelta] = useState(1),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [day, setDay] = useState(localDate());
  const permitted = canAccessStoreRole(shop.user, shop.store?.id, ['MANAGER']),
    base = permitted && shop.store ? `/stores/${shop.store.id}` : null;
  const inventory = useResource<Page<Inventory>>(
    base
      ? `${base}/inventory?${query({ limit: 20, q: search, lowStock: low ? 'true' : undefined, cursor })}`
      : null,
  );
  const orders = useResource<Page<Order>>(base ? `${base}/orders?limit=100` : null);
  const report = useResource<Report>(
    base
      ? `${base}/reports/summary?${query({ from: `${day}T00:00:00+07:00`, to: `${new Date(new Date(`${day}T00:00:00+07:00`).getTime() + 86400000).toISOString()}` })}`
      : null,
  );
  const slots = useResource<Slot[]>(base ? `${base}/slots` : null);
  const [starts, setStarts] = useState(`${localDate()}T10:00`),
    [ends, setEnds] = useState(`${localDate()}T11:00`),
    [capacity, setCapacity] = useState(20);
  useEffect(() => {
    setTab(shop.user?.isAdmin ? 'staff' : 'catalog');
    setCursor('');
    setEditing(null);
    setError(null);
  }, [shop.store?.id, shop.user?.id]);
  function refresh() {
    inventory.refresh();
    orders.refresh();
    report.refresh();
    slots.refresh();
  }
  async function adjust() {
    if (!editing || !base) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/inventory/adjustments`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { skuId: editing.skuId, delta, reason, expectedVersion: editing.version },
      });
      setEditing(null);
      setReason('');
      refresh();
      shop.notice('Đã cập nhật tồn kho và lưu lịch sử điều chỉnh.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function createSlot() {
    if (!base) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/slots`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { startsAt: `${starts}:00+07:00`, endsAt: `${ends}:00+07:00`, capacity },
      });
      slots.refresh();
      shop.notice('Đã mở khung giờ nhận hàng.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const stats = [
    {
      label: 'Đơn đã nhận',
      value: String(report.data?.completedOrders ?? 0),
      icon: ClipboardCheck,
    },
    { label: 'Giá trị đơn hoàn tất', value: money(report.data?.completedOrderValue), icon: Boxes },
    { label: 'Tiền mặt đã thu', value: money(report.data?.cashCollected), icon: Banknote },
    { label: 'Tiền đã hoàn', value: money(report.data?.refunded), icon: Wallet },
  ];
  return (
    <AccessGate roles={['MANAGER']}>
      <div className="container">
        <PageTitle
          eyebrow="VẬN HÀNH CỬA HÀNG"
          title="Một cửa hàng, luôn trong tầm tay."
          subtitle={`${shop.store?.name ?? ''} · Theo dõi đơn, giữ tồn chính xác và chủ động sức chứa.`}
          action={
            <button className="button secondary small" onClick={refresh}>
              <RefreshCw size={15} />
              Cập nhật
            </button>
          }
        />
        <SellerLocationLink />
        <div className="row between wrap" style={{ marginBottom: 18 }}>
          <p className="muted">Tổng quan trong ngày</p>
          <label className="row">
            Ngày báo cáo
            <input
              className="field"
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value);
              }}
            />
          </label>
        </div>
        <ErrorBox error={report.error} retry={report.refresh} />
        <div className="stats">
          {stats.map(({ label, value, icon: Icon }) => (
            <div className="stat" key={label}>
              <span>
                <Icon size={18} />
              </span>
              <small>{label}</small>
              <strong>{report.data ? value : '—'}</strong>
            </div>
          ))}
        </div>
        <div className="filters">
          {[
            ['catalog', 'Danh mục & sản phẩm'],
            ['staff', 'Nhân viên'],
            ['inventory', 'Tồn kho'],
            ['orders', 'Đơn hàng'],
            ['slots', 'Khung giờ nhận'],
            ['reports', 'Báo cáo thu tiền'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`filter-button ${tab === value ? 'active' : ''}`}
              onClick={() => {
                setTab(value);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <ErrorBox error={!editing ? error : null} />
        {tab === 'catalog' && base && (
          <SellerCatalog base={base} onProductCreated={inventory.refresh} />
        )}
        {tab === 'staff' && base && <StaffManagement base={base} />}
        {tab === 'inventory' && (
          <section className="panel">
            <div className="panel-heading">
              <h2>Tồn kho theo sản phẩm</h2>
              <label className="row muted" style={{ fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={low}
                  onChange={(e) => {
                    setLow(e.target.checked);
                    setCursor('');
                  }}
                />
                Sắp hết (≤ 5)
              </label>
            </div>
            <input
              className="field"
              placeholder="Tìm tên hoặc mã SKU…"
              aria-label="Tìm tồn kho"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursor('');
              }}
              style={{ marginBottom: 18, maxWidth: 350 }}
            />
            <ErrorBox error={inventory.error} retry={inventory.refresh} />
            {inventory.loading && !inventory.data ? (
              <Loading />
            ) : !inventory.data?.items.length ? (
              <Empty title="Chưa có sản phẩm phù hợp">
                <button className="text-button" onClick={() => setTab('catalog')}>
                  Thêm sản phẩm đầu tiên
                </button>
              </Empty>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Tồn vật lý</th>
                      <th>Đang giữ</th>
                      <th>Có thể bán</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <small>{item.code}</small>
                        </td>
                        <td>{item.onHand}</td>
                        <td>{item.reserved}</td>
                        <td>
                          <span className={`stock-count ${item.available <= 5 ? 'low' : ''}`}>
                            {item.available}
                          </span>
                        </td>
                        <td>
                          <div className="row">
                            <button
                              className="text-button"
                              onClick={() => {
                                setEditing(item);
                                setDelta(1);
                                setReason('');
                                setError(null);
                              }}
                            >
                              Điều chỉnh
                            </button>
                            <PriceEditor skuId={item.skuId} refresh={refresh} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="load-more row">
              {cursor && (
                <button className="text-button" onClick={() => setCursor('')}>
                  Trang đầu
                </button>
              )}
              {inventory.data?.nextCursor && (
                <button
                  className="button secondary small"
                  onClick={() => setCursor(inventory.data!.nextCursor!)}
                >
                  Trang tiếp
                </button>
              )}
            </div>
          </section>
        )}
        {tab === 'orders' && (
          <section className="panel">
            <div className="panel-heading">
              <h2>Đơn tại cửa hàng</h2>
              <small>Tối đa 100 đơn theo trang API</small>
            </div>
            <ErrorBox error={orders.error} retry={orders.refresh} />
            {orders.loading && !orders.data ? (
              <Loading />
            ) : !orders.data?.items.length ? (
              <Empty title="Cửa hàng chưa có đơn" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Đơn</th>
                      <th>Ngày đặt</th>
                      <th>Trạng thái</th>
                      <th>Tổng</th>
                      <th>Xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.data.items.map((order) => (
                      <tr key={order.id}>
                        <td>{shortCode(order.code)}</td>
                        <td>{dateTime(order.createdAt)}</td>
                        <td>
                          <Badge status={order.status} />
                        </td>
                        <td>{money(order.total)}</td>
                        <td>
                          <ManagerCancel order={order} refresh={refresh} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {tab === 'slots' && (
          <div className="checkout-grid">
            <section className="panel">
              <h2 className="form-section-title">
                <CalendarClock size={20} />
                Khung còn nhận đơn
              </h2>
              <ErrorBox error={slots.error} retry={slots.refresh} />
              {slots.loading ? (
                <Loading />
              ) : !slots.data?.length ? (
                <Empty title="Chưa có khung còn nhận đơn" />
              ) : (
                <div className="stack">
                  {slots.data.map((slot) => (
                    <div className="row between wrap" key={slot.id}>
                      <div>
                        <strong>
                          {dateTime(slot.startsAt)} – {dateTime(slot.endsAt)}
                        </strong>
                        <small>
                          {slot.allocatedCount}/{slot.capacity} suất đã cấp
                        </small>
                      </div>
                      <span className="badge">Còn {slot.available} suất</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <form
              className="panel form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void createSlot();
              }}
            >
              <h2 style={{ fontSize: 21 }}>Mở khung giờ mới</h2>
              <label>
                Bắt đầu (giờ Việt Nam)
                <input
                  type="datetime-local"
                  value={starts}
                  onChange={(e) => setStarts(e.target.value)}
                  required
                />
              </label>
              <label>
                Kết thúc
                <input
                  type="datetime-local"
                  value={ends}
                  onChange={(e) => setEnds(e.target.value)}
                  required
                />
              </label>
              <label>
                Sức chứa
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  required
                />
              </label>
              <button className="button" disabled={busy}>
                Tạo khung giờ
              </button>
              <small>Chọn thời gian trong tương lai, không trùng khung đã có.</small>
            </form>
          </div>
        )}
        {tab === 'reports' && (
          <section className="panel">
            <h2 className="form-section-title">Tách bạch doanh thu và dòng tiền</h2>
            <div className="summary-line">
              <span>Giá trị đơn đã hoàn tất</span>
              <strong>{money(report.data?.completedOrderValue)}</strong>
            </div>
            <div className="summary-line">
              <span>Tiền mặt thu trong ngày</span>
              <strong>{money(report.data?.cashCollected)}</strong>
            </div>
            <div className="summary-line">
              <span>Thanh toán online được xác minh</span>
              <strong>{money(report.data?.onlineCollected)}</strong>
            </div>
            <div className="summary-line">
              <span>Hoàn tiền thành công</span>
              <strong>{money(report.data?.refunded)}</strong>
            </div>
            <div className="info-note">
              Đơn đã trả tiền nhưng chưa bàn giao chưa được tính là đơn hoàn tất. Số liệu lấy theo
              ngày Việt Nam đã chọn.
            </div>
          </section>
        )}
        <Modal open={!!editing} onClose={() => setEditing(null)} title="Điều chỉnh tồn kho">
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void adjust();
            }}
          >
            <p>{editing?.name}</p>
            <div className="info-note">
              Tồn vật lý {editing?.onHand} · Đang giữ {editing?.reserved}. Không thể giảm tồn xuống
              dưới lượng giữ.
            </div>
            <label>
              Số lượng thay đổi (+ nhập, − xuất)
              <input
                type="number"
                min={-1000000000}
                max={1000000000}
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
                required
              />
            </label>
            <label>
              Lý do
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                maxLength={500}
                required
                placeholder="Ví dụ: Nhập bổ sung từ kho"
              />
            </label>
            <ErrorBox error={error} />
            <button disabled={busy || delta === 0} className="button">
              Xác nhận điều chỉnh
            </button>
          </form>
        </Modal>
      </div>
    </AccessGate>
  );
}
function PriceEditor({ skuId, refresh }: { skuId: string; refresh: () => void }) {
  const shop = useShop(),
    [product, setProduct] = useState<Product | null>(null),
    [price, setPrice] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  async function open() {
    setBusy(true);
    try {
      const item = await api<Product>(`/stores/${shop.store!.id}/products/${skuId}`);
      setProduct(item);
      setPrice(item.price);
      setError(null);
    } catch (e) {
      shop.notice(messageOf(e), true);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${shop.store!.id}/products/${skuId}`, {
        method: 'PUT',
        token: shop.token,
        idempotent: true,
        body: { price, active: true, expectedVersion: product.version },
      });
      setProduct(null);
      refresh();
      shop.notice('Đã cập nhật giá bán.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="text-button" disabled={busy} onClick={() => void open()}>
        Sửa giá
      </button>
      <Modal open={!!product} onClose={() => setProduct(null)} title="Cập nhật giá bán">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p>{product?.name}</p>
          <label>
            Giá mới (VND)
            <input
              type="number"
              min={0}
              max={1000000000000}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              required
            />
          </label>
          <ErrorBox error={error} />
          <button className="button" disabled={busy}>
            Lưu giá bán
          </button>
        </form>
      </Modal>
    </>
  );
}
function ManagerCancel({ order, refresh }: { order: Order; refresh: () => void }) {
  const shop = useShop(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [restock, setRestock] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  if (!['CONFIRMED', 'PENDING_PAYMENT', 'PICKING', 'READY'].includes(order.status))
    return <span className="muted">—</span>;
  async function cancel() {
    setBusy(true);
    try {
      await api(`/stores/${shop.store!.id}/orders/${order.id}/cancel`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: order.version, reason, restockConfirmed: restock },
      });
      setOpen(false);
      refresh();
      shop.notice('Đã hủy và trả lại giữ chỗ hợp lệ.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="text-button danger-text" onClick={() => setOpen(true)}>
        Hủy có kiểm soát
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Hủy ${shortCode(order.code)}`}>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void cancel();
          }}
        >
          <label>
            Lý do
            <input
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {['PICKING', 'READY'].includes(order.status) && (
            <label className="row">
              <input
                type="checkbox"
                required
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
              />
              Đã kiểm tra và trả hàng về khu vực bán
            </label>
          )}
          <ErrorBox error={error} />
          <button className="button danger" disabled={busy}>
            Xác nhận hủy đơn
          </button>
        </form>
      </Modal>
    </>
  );
}
