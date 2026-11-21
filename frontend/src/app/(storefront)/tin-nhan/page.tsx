import { OrderChatPage } from '@/features/chat/customer-chat';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function chatId(value: string | string[] | undefined) {
  return typeof value === 'string' && uuid.test(value) ? value : undefined;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <OrderChatPage orderId={chatId(params.order)} />;
}
