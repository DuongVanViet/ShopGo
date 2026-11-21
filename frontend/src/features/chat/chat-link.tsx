import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

export function ChatLink({ orderId }: { orderId: string }) {
  return (
    <Link
      className="button secondary small"
      href={`/tin-nhan?order=${encodeURIComponent(orderId)}`}
    >
      <MessageCircle size={17} aria-hidden="true" /> Chat với cửa hàng
    </Link>
  );
}
