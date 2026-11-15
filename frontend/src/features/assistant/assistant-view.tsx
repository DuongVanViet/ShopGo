'use client';
import { useEffect, useState } from 'react';
import { Check, ClipboardList, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import type { Page, Product, Proposal } from '@/types';
import { AccessGate, ErrorBox, PageTitle } from '@/components/ui';

export function AssistantView() {
  const shop = useShop(),
    products = useResource<Page<Product>>(
      shop.store ? `/stores/${shop.store.id}/products?inStock=true&limit=100` : null,
    );
  const [items, setItems] = useState<{ skuId: string; quantity: number }[]>([]),
    [sku, setSku] = useState(''),
    [quantity, setQuantity] = useState(1),
    [budget, setBudget] = useState(300000),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [conversation, setConversation] = useState<string | null>(null),
    [question, setQuestion] = useState(''),
    [answer, setAnswer] = useState('');
  useEffect(() => {
    setItems([]);
    setProposal(null);
    setConversation(null);
    setAnswer('');
    setError(null);
  }, [shop.user?.id, shop.store?.id]);
  async function propose() {
    if (!shop.store) return;
    setBusy(true);
    setError(null);
    try {
      setProposal(
        await api<Proposal>('/assistant/proposals', {
          method: 'POST',
          token: shop.token,
          body: { storeId: shop.store.id, items, budget },
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!proposal) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/assistant/proposals/${proposal.id}/apply`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: {
          confirmationToken: proposal.confirmationToken,
          expectedCartVersion: proposal.expectedCartVersion,
        },
      });
      await shop.refreshCart();
      setProposal(null);
      setItems([]);
      shop.notice('Đã thêm các món bạn xác nhận vào giỏ.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function chat() {
    if (!shop.store) return;
    setBusy(true);
    setError(null);
    try {
      let id = conversation;
      if (!id) {
        id = (
          await api<{ id: string }>('/assistant/conversations', {
            method: 'POST',
            token: shop.token,
            body: { storeId: shop.store.id },
          })
        ).id;
        setConversation(id);
      }
      const reply = await api<{ answer: string; proposal: Proposal | null }>(
        `/assistant/conversations/${id}/messages`,
        { method: 'POST', token: shop.token, body: { message: question, budget } },
      );
      setAnswer(reply.answer);
      setProposal(reply.proposal);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessGate>
      <div className="container">
        <PageTitle
          eyebrow="CHỌN CÓ CHỦ ĐÍCH, MUA VỪA ĐỦ"
          title="Lên một giỏ hàng vừa ý."
          subtitle="Tạo danh sách để xem giá và ngân sách trước. Chỉ thêm vào giỏ khi bạn xác nhận."
        />
        <div className="checkout-grid">
          <div className="stack">
            <section className="panel form-stack">
              <h2 className="form-section-title">
                <ClipboardList size={21} />
                Danh sách dự kiến
              </h2>
              <ErrorBox error={products.error} retry={products.refresh} />
              <label>
                Ngân sách cho món thêm (VND)
                <input
                  type="number"
                  min={1}
                  max={1000000000000}
                  value={budget}
                  onChange={(e) => {
                    setBudget(Number(e.target.value));
                    setProposal(null);
                  }}
                />
              </label>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setItems((old) => {
                    const exists = old.find((item) => item.skuId === sku);
                    return exists
                      ? old.map((item) =>
                          item.skuId === sku
                            ? { ...item, quantity: Math.min(1000, item.quantity + quantity) }
                            : item,
                        )
                      : [...old, { skuId: sku, quantity }];
                  });
                  setProposal(null);
                }}
              >
                <label>
                  Sản phẩm
                  <select value={sku} onChange={(e) => setSku(e.target.value)} required>
                    <option value="">Chọn món còn hàng</option>
                    {products.data?.items.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {money(product.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <label style={{ width: 120 }}>
                    Số lượng
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      required
                    />
                  </label>
                  <button
                    className="button secondary"
                    style={{ alignSelf: 'end' }}
                    disabled={!sku || items.length >= 20}
                  >
                    <Plus size={16} />
                    Thêm vào danh sách
                  </button>
                </div>
              </form>
              {items.map((item) => (
                <div className="row between" key={item.skuId}>
                  <span>
                    {item.quantity} ×{' '}
                    {products.data?.items.find((product) => product.id === item.skuId)?.name}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Bỏ món khỏi danh sách"
                    onClick={() => {
                      setItems((old) => old.filter((i) => i.skuId !== item.skuId));
                      setProposal(null);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="button"
                disabled={busy || !items.length}
                onClick={() => void propose()}
              >
                Kiểm tra danh sách & ngân sách
              </button>
            </section>
            <section className="panel form-stack">
              <h2 className="form-section-title">
                <Sparkles size={21} />
                Hỏi trợ lý mua sắm
              </h2>
              <p className="muted">
                Trợ lý hoạt động khi AI service được cấu hình. Bạn vẫn có thể thử danh sách dự kiến
                phía trên khi chưa có AI.
              </p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void chat();
                }}
              >
                <label>
                  Bạn đang cần gì?
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                    maxLength={3000}
                    placeholder="Ví dụ: Bữa tối 4 người với ngân sách 300k"
                  />
                </label>
                <button className="button secondary" disabled={busy}>
                  <Send size={16} />
                  Gửi câu hỏi
                </button>
              </form>
              {answer && <div className="chat-message">{answer}</div>}
            </section>
          </div>
          <aside className="panel summary">
            <h2>Xem lại trước khi thêm</h2>
            <ErrorBox error={error} />
            {proposal ? (
              <div className="stack">
                {proposal.items.map((item) => (
                  <div className="summary-line" key={item.skuId}>
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <strong>{money(item.quantity * item.unitPrice)}</strong>
                  </div>
                ))}
                <div className="summary-line">
                  <span>Giá trị món thêm</span>
                  <strong>{money(proposal.addedTotal)}</strong>
                </div>
                <div className="summary-line total">
                  <span>Tổng giỏ dự kiến</span>
                  <strong>{money(proposal.cartTotal)}</strong>
                </div>
                <small>
                  Giá trước voucher/phí. Đề xuất có hạn 2 phút; giá và tồn được kiểm tra lại khi xác
                  nhận.
                </small>
                <button className="button" disabled={busy} onClick={() => void apply()}>
                  <Check size={17} />
                  Xác nhận thêm vào giỏ
                </button>
              </div>
            ) : (
              <div className="info-note">
                Danh sách dự kiến chưa thay đổi giỏ. Chọn món rồi kiểm tra để nhận bản xem trước từ
                cửa hàng.
              </div>
            )}
          </aside>
        </div>
      </div>
    </AccessGate>
  );
}
