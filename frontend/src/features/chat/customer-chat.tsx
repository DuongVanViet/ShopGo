'use client';

import Link from 'next/link';
import { AccessGate, Empty } from '@/components/ui';
import { isCustomerUser } from '@/lib/access';
import { useShop } from '@/store/shop';
import { ChatInbox } from './chat-inbox';

export function OrderChatPage({ orderId }: { orderId?: string }) {
  const { user, store } = useShop();
  return (
    <div className="container customer-chat-page">
      <h1>Tin nhắn theo đơn hàng</h1>
      {!user ? (
        <section className="panel">
          <Empty title="Đăng nhập để nhắn tin về đơn hàng">
            <Link className="button" href="/login">
              Đăng nhập
            </Link>
          </Empty>
        </section>
      ) : isCustomerUser(user) ? (
        <ChatInbox key={user.id} orderId={orderId} />
      ) : (
        <AccessGate roles={['MANAGER', 'PICKER', 'COUNTER']}>
          {store && <ChatInbox key={`${user.id}:${store.id}`} storeId={store.id} />}
        </AccessGate>
      )}
    </div>
  );
}
