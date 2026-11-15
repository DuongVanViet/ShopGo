import type { OrderStatus } from '@/types';
export const money = (amount = 0) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
export const time = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(date));
export const dateTime = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(date));
export const statuses: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  PICKING: 'Đang soạn hàng',
  READY: 'Sẵn sàng nhận',
  COMPLETED: 'Đã nhận hàng',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
};
export const paymentLabels: Record<string, string> = {
  UNPAID: 'Chưa thu tiền',
  PENDING: 'Chờ thanh toán',
  PARTIALLY_PAID: 'Đã thanh toán cọc',
  DEPOSIT_PAID: 'Đã thanh toán cọc',
  PAID: 'Đã thanh toán',
  REFUND_PENDING: 'Đang chờ hoàn tiền',
  PARTIALLY_REFUNDED: 'Đã hoàn một phần',
  REFUNDED: 'Đã hoàn tiền',
};
export const shortCode = (code: string) => code.slice(0, 11);
export const localDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
