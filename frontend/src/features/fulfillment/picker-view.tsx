'use client';
import { useEffect, useState } from 'react';
import { Check, CheckCircle2, ClipboardList, RefreshCw, ScanLine } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { canAccessStoreRole } from '@/lib/access';
import { dateTime, money, shortCode } from '@/lib/format';
import { AccessGate, Badge, Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';
import type { Order, OrderItem, Page } from '@/types';

export function PickerView() {
  const shop = useShop(),
    [filter, setFilter] = useState('CONFIRMED'),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setSelected(null);
    setError(null);
  }, [shop.user?.id, shop.store?.id]);
  const permitted = canAccessStoreRole(shop.user, shop.store?.id, ['PICKER']);
  const list = useResource<Page<Order>>(
    permitted && shop.store ? `/stores/${shop.store.id}/orders?limit=100&status=${filter}` : null,
    8000,
  );
  const detail = useResource<Order>(permitted && selected ? `/orders/${selected}` : null);
  async function claim(order: Order) {
    if (!shop.store) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${shop.store.id}/orders/${order.id}/claim`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: order.version },
      });
      setSelected(order.id);
      setFilter('PICKING');
      detail.refresh();
      list.refresh();
      shop.notice('Đã nhận đơn soạn hàng.');
    } catch (e) {
      setError(e);
      list.refresh();
    } finally {
      setBusy(false);
    }
  }
  async function ready() {
    if (!detail.data || !shop.store) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${shop.store.id}/orders/${detail.data.id}/ready`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: detail.data.version },
      });
      detail.refresh();
      list.refresh();
      shop.notice('Đơn đã sẵn sàng. Khách có thể lấy mã QR.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessGate roles={['PICKER']}>
      <div className="container">
        <PageTitle
          eyebrow="VẬN HÀNH CỬA HÀNG"
          title="Soạn từng túi, trọn từng món."
          subtitle="Nhận đơn, kiểm tra mã hàng và xác nhận khi đã soạn đủ."
          action={
            <button
              className="button secondary small"
              onClick={() => {
                list.refresh();
                detail.refresh();
              }}
            >
              <RefreshCw size={15} />
              Cập nhật
            </button>
          }
        />
        <div className="filters">
          {[
            ['CONFIRMED', 'Đơn chờ soạn'],
            ['PICKING', 'Đang soạn'],
            ['READY', 'Đã sẵn sàng'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`filter-button ${filter === value ? 'active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <ErrorBox error={error} />
        <div className="ops-grid">
          <aside className="ops-list">
            <ErrorBox error={list.error} retry={list.refresh} />
            {list.loading && !list.data ? (
              <Loading />
            ) : !list.data?.items.length ? (
              <div className="panel">
                <Empty title="Chưa có đơn trong mục này" />
              </div>
            ) : (
              list.data.items.map((order) => (
                <div
                  className={`ops-card ${selected === order.id ? 'selected' : ''}`}
                  key={order.id}
                >
                  <div className="row between">
                    <h3>{shortCode(order.code)}</h3>
                    <Badge status={order.status} />
                  </div>
                  <p>
                    {dateTime(order.createdAt)} · {money(order.total)}
                  </p>
                  {order.status === 'CONFIRMED' ? (
                    <button
                      className="button small wide"
                      disabled={busy}
                      onClick={() => void claim(order)}
                    >
                      <ClipboardList size={15} />
                      Nhận soạn đơn này
                    </button>
                  ) : (
                    <button
                      className="button secondary small wide"
                      onClick={() => setSelected(order.id)}
                    >
                      Xem danh sách hàng
                    </button>
                  )}
                </div>
              ))
            )}
          </aside>
          <section className="panel">
            <ErrorBox error={detail.error} retry={detail.refresh} />
            {!selected ? (
              <Empty title="Chọn một đơn để bắt đầu">
                <p>Mỗi đơn chỉ có một nhân viên đang nhận soạn.</p>
              </Empty>
            ) : !detail.data ? (
              <Loading />
            ) : (
              <>
                <div className="panel-heading">
                  <div>
                    <h2>Đơn {shortCode(detail.data.code)}</h2>
                    {detail.data.voucherCode && (
                      <p>
                        Mã {detail.data.voucherCode} · Giảm {money(detail.data.discount)}
                      </p>
                    )}
                    <small>{detail.data.slot ? dateTime(detail.data.slot.startsAt) : ''}</small>
                  </div>
                  <Badge status={detail.data.status} />
                </div>
                {detail.data.items?.map((item) => (
                  <PickItem
                    key={`${item.id}:${detail.data!.version}`}
                    item={item}
                    order={detail.data!}
                    disabled={busy || detail.data!.status !== 'PICKING'}
                    refresh={() => {
                      detail.refresh();
                      list.refresh();
                    }}
                  />
                ))}
                {detail.data.status === 'PICKING' && (
                  <button
                    className="button wide"
                    style={{ marginTop: 24 }}
                    disabled={
                      busy || detail.data.items?.some((i) => i.pickedQuantity !== i.quantity)
                    }
                    onClick={() => void ready()}
                  >
                    <CheckCircle2 size={18} />
                    Đã kiểm tra, sẵn sàng nhận
                  </button>
                )}
                {detail.data.status === 'READY' && (
                  <div className="info-note" style={{ marginTop: 20 }}>
                    Đơn đã sẵn sàng. Chuyển sang tài khoản khách để lấy QR, sau đó tài khoản Quầy
                    nhận để bàn giao.
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </AccessGate>
  );
}
function PickItem({
  item,
  order,
  disabled,
  refresh,
}: {
  item: OrderItem;
  order: Order;
  disabled: boolean;
  refresh: () => void;
}) {
  const shop = useShop(),
    [barcode, setBarcode] = useState(''),
    [quantity, setQuantity] = useState(item.quantity),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  async function submit() {
    if (!shop.store) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${shop.store.id}/orders/${order.id}/picking-items/${item.id}`, {
        method: 'PUT',
        token: shop.token,
        idempotent: true,
        body: { barcode, pickedQuantity: quantity, expectedVersion: order.version },
      });
      refresh();
    } catch (e) {
      setError(e);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`pick-item ${item.pickedQuantity === item.quantity ? 'done' : ''}`}>
      <div>
        <h3>{item.name}</h3>
        <small>
          {item.skuCode} · Cần {item.quantity} đơn vị
        </small>
        <small>Mã hàng: {item.barcode ?? item.skuCode}</small>
        <div style={{ marginTop: 10 }}>
          {item.pickedQuantity === item.quantity ? (
            <span className="badge">
              <Check size={13} />
              Đã đủ {item.pickedQuantity}/{item.quantity}
            </span>
          ) : (
            <span className="muted">
              Đã soạn {item.pickedQuantity}/{item.quantity}
            </span>
          )}
        </div>
      </div>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Quét hoặc nhập mã hàng
          <input
            aria-label={`Mã hàng ${item.name}`}
            placeholder="Nhập mã trên sản phẩm"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            disabled={disabled || busy}
            required
          />
        </label>
        <div className="row">
          <label style={{ width: 85 }}>
            Số lượng
            <input
              type="number"
              min={0}
              max={item.quantity}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              disabled={disabled || busy}
            />
          </label>
          <button
            className="button small"
            style={{ alignSelf: 'end', flex: 1 }}
            disabled={disabled || busy}
          >
            <ScanLine size={15} />
            Xác nhận món
          </button>
        </div>
        <ErrorBox error={error} />
      </form>
    </div>
  );
}
