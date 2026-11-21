'use client';

import Link from 'next/link';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Empty, ErrorBox, Loading } from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { api, ApiError, query } from '@/lib/api';
import { dateTime, shortCode } from '@/lib/format';
import { useShop } from '@/store/shop';

type Side = 'CUSTOMER' | 'STORE';

interface InboxEntry {
  id: string;
  orderCode: string;
  storeName: string;
  customerName: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
}
interface ChatPage<T> {
  items: T[];
  nextBefore: number | null;
}
interface Message {
  id: number;
  body: string;
  senderSide: Side;
  createdAt: string;
}
interface MessagePage extends ChatPage<Message> {
  thread: {
    orderCode: string;
    storeName: string;
    customerName: string;
    side: Side;
    unread: boolean;
  };
}

export function ChatInbox({ storeId, orderId }: { storeId?: string; orderId?: string }) {
  const [selected, setSelected] = useState<string>();
  const [before, setBefore] = useState<number>();
  const active = storeId ? selected : orderId;
  const path = storeId ? `/chat/stores/${storeId}/threads` : '/chat/threads';
  const inbox = useResource<ChatPage<InboxEntry>>(`${path}?${query({ limit: 20, before })}`, 5000);
  const { updateData, refresh } = inbox;
  const removeUnavailable = useCallback(
    (id: string) => {
      updateData((page) => ({ ...page, items: page.items.filter((entry) => entry.id !== id) }));
      refresh();
    },
    [updateData, refresh],
  );

  return (
    <div className={`chat-layout${active ? ' has-active-chat' : ''}`}>
      <section className="panel chat-inbox" aria-label="Cuộc trò chuyện">
        <h2>Cuộc trò chuyện theo đơn</h2>
        <ErrorBox error={inbox.error} retry={inbox.refresh} />
        {inbox.loading && !inbox.data && <Loading label="Đang tải hộp thư…" />}
        {inbox.data?.items.length === 0 && (
          <p className="muted">
            {before ? 'Đã hết cuộc trò chuyện ở trang này.' : 'Chưa có cuộc trò chuyện.'}
          </p>
        )}
        <div className="chat-conversation-list">
          {inbox.data?.items.map((entry) => {
            const content = (
              <>
                <span className="chat-conversation-title">
                  <strong>{storeId ? entry.customerName : entry.storeName}</strong>
                  {entry.unread && <span className="chat-unread">Mới</span>}
                </span>
                <time dateTime={entry.lastMessageAt}>{dateTime(entry.lastMessageAt)}</time>
                <span className="chat-preview">Đơn {shortCode(entry.orderCode)}</span>
                <span className="chat-preview">{entry.lastMessage}</span>
              </>
            );
            const props = {
              className: 'chat-conversation',
              'aria-current': active === entry.id ? true : undefined,
            };
            return storeId ? (
              <button type="button" key={entry.id} {...props} onClick={() => setSelected(entry.id)}>
                {content}
              </button>
            ) : (
              <Link key={entry.id} {...props} href={`/tin-nhan?${query({ order: entry.id })}`}>
                {content}
              </Link>
            );
          })}
        </div>
        <div className="chat-page-actions">
          {before && (
            <button className="text-button" type="button" onClick={() => setBefore(undefined)}>
              Về đầu hộp thư
            </button>
          )}
          {inbox.data?.nextBefore && (
            <button
              className="text-button"
              type="button"
              onClick={() => setBefore(inbox.data!.nextBefore!)}
            >
              Cuộc trò chuyện cũ hơn
            </button>
          )}
        </div>
        {!storeId && (
          <Link href="/don-hang" className="text-button">
            Xem đơn của tôi
          </Link>
        )}
      </section>
      {active ? (
        <ChatThread
          key={active}
          orderId={active}
          onActivity={inbox.refresh}
          onUnavailable={removeUnavailable}
          back={
            storeId ? (
              <button type="button" className="text-button" onClick={() => setSelected(undefined)}>
                <ArrowLeft size={16} /> Hộp thư
              </button>
            ) : (
              <Link className="text-button" href="/tin-nhan">
                <ArrowLeft size={16} /> Hộp thư
              </Link>
            )
          }
        />
      ) : (
        <section className="panel chat-empty">
          <MessageCircle size={36} aria-hidden="true" />
          <p>
            {storeId
              ? 'Chọn một cuộc trò chuyện để trả lời khách.'
              : 'Chọn cuộc trò chuyện hoặc mở chat từ chi tiết đơn hàng.'}
          </p>
        </section>
      )}
    </div>
  );
}

function ChatThread({
  orderId,
  back,
  onActivity,
  onUnavailable,
}: {
  orderId: string;
  back: React.ReactNode;
  onActivity: () => void;
  onUnavailable: (id: string) => void;
}) {
  const { token } = useShop();
  const [before, setBefore] = useState<number>();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [closedError, setClosedError] = useState<ApiError | null>(null);
  const messageArea = useRef<HTMLDivElement>(null);
  const scrollToLatest = useRef(true);
  const pendingRead = useRef(0);
  const path = `/chat/orders/${orderId}`;
  const history = useResource<MessagePage>(
    closedError ? null : `${path}/messages?${query({ before })}`,
    3000,
  );
  const terminalError =
    closedError ??
    [error, history.error].find(
      (caught): caught is ApiError =>
        caught instanceof ApiError && [403, 404, 410].includes(caught.status),
    );
  const thread = history.data?.thread;
  const latest = history.data?.items.at(-1)?.id;
  useEffect(() => {
    if (terminalError && !closedError) {
      setClosedError(terminalError);
      setBody('');
      onUnavailable(orderId);
    }
  }, [terminalError, closedError, orderId, onUnavailable]);

  useEffect(() => {
    const el = messageArea.current;
    if (!el || !latest) return;
    if (before) el.scrollTop = 0;
    else if (scrollToLatest.current) el.scrollTop = el.scrollHeight;
  }, [before, latest]);

  useEffect(() => {
    if (
      before ||
      terminalError ||
      !thread?.unread ||
      !latest ||
      document.visibilityState !== 'visible' ||
      pendingRead.current >= latest
    )
      return;
    pendingRead.current = latest;
    void api(`${path}/read`, { method: 'PUT', token, body: { through: latest } })
      .then(onActivity)
      .catch(() => {
        if (pendingRead.current === latest) pendingRead.current = 0;
      });
  }, [before, history.data, latest, onActivity, path, terminalError, thread?.unread, token]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = body.trim();
    if (busy || !value) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${path}/messages`, {
        method: 'POST',
        idempotent: true,
        token,
        body: { body: value },
      });
      setBody('');
      scrollToLatest.current = true;
      setBefore(undefined);
      history.refresh();
      onActivity();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (terminalError)
    return (
      <section className="panel chat-thread" aria-label="Tin nhắn trong cuộc trò chuyện">
        {back}
        <p role="status">
          {terminalError.status === 410
            ? 'Cuộc trò chuyện đã kết thúc. Tin nhắn đã được xóa.'
            : 'Bạn hiện không có quyền xem cuộc trò chuyện này.'}
        </p>
      </section>
    );

  return (
    <section className="panel chat-thread" aria-label="Tin nhắn trong cuộc trò chuyện">
      <header className="chat-thread-header">
        {back}
        <h2>
          {thread ? (thread.side === 'STORE' ? thread.customerName : thread.storeName) : 'Tin nhắn'}
        </h2>
        {thread &&
          (thread.side === 'CUSTOMER' ? (
            <Link className="chat-order" href={`/don-hang/${orderId}`}>
              Đơn {shortCode(thread.orderCode)}
            </Link>
          ) : (
            <span className="chat-order">Đơn {shortCode(thread.orderCode)}</span>
          ))}
      </header>
      <ErrorBox error={history.error} retry={history.refresh} />
      <div
        className="chat-message-area"
        ref={messageArea}
        onScroll={(event) => {
          const el = event.currentTarget;
          scrollToLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {history.loading && !history.data && <Loading label="Đang tải tin nhắn…" />}
        <div className="chat-page-actions">
          {history.data?.nextBefore && (
            <button
              type="button"
              className="text-button"
              onClick={() => setBefore(history.data!.nextBefore!)}
            >
              Tin nhắn cũ hơn
            </button>
          )}
          {before && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                scrollToLatest.current = true;
                setBefore(undefined);
              }}
            >
              Về tin mới nhất
            </button>
          )}
        </div>
        {history.data?.items.length === 0 && (
          <p className="muted">Gửi tin nhắn đầu tiên để bắt đầu.</p>
        )}
        <ol className="chat-message-list" aria-label="Lịch sử tin nhắn" aria-live="polite">
          {history.data?.items.map((message) => {
            const own = message.senderSide === thread?.side;
            return (
              <li key={message.id} className={`store-chat-message${own ? ' is-own' : ''}`}>
                <div className="chat-message-meta">
                  <span>
                    {own ? 'Bạn' : message.senderSide === 'STORE' ? 'Cửa hàng' : 'Khách hàng'}
                  </span>
                  <time dateTime={message.createdAt}>{dateTime(message.createdAt)}</time>
                </div>
                <div className="chat-bubble">
                  <p>{message.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      {thread && (
        <form className="chat-composer" onSubmit={(event) => void send(event)}>
          <ErrorBox error={error} />
          <div className="chat-compose-row">
            <textarea
              aria-label="Nội dung tin nhắn"
              placeholder={thread.side === 'STORE' ? 'Nhập phản hồi…' : 'Nhập tin nhắn…'}
              rows={2}
              maxLength={2000}
              value={body}
              readOnly={busy}
              onChange={(event) => setBody(event.target.value)}
            />
            <button className="button small" type="submit" disabled={busy || !body.trim()}>
              <Send size={16} aria-hidden="true" /> {busy ? 'Đang gửi…' : 'Gửi'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
