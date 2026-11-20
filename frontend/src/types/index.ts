export interface Store {
  id: string;
  code: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}
export interface Category {
  id: string;
  name: string;
  slug: string;
  ownerStoreId?: string | null;
}
export interface Product {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  unit: string;
  description: string;
  categoryId: string | null;
  price: number;
  originalPrice?: number;
  available: number;
  version: number;
  expiresOn?: string | null;
  imageUrl?: string | null;
  store?: Store;
}
export interface ManagedProduct {
  salePrice?: number | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  id: string;
  productId: string;
  skuId: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  code: string;
  barcode: string | null;
  unit: string;
  price: number;
  onHand: number;
  reserved: number;
  available: number;
  active: boolean;
  version: number;
  expiresOn?: string | null;
  imageUrl?: string | null;
}
export interface StaffAccount {
  id: string;
  displayName: string;
  phoneNormalized: string | null;
  emailNormalized: string | null;
  accountType: 'STAFF' | 'SELLER' | 'USER';
  status: 'ACTIVE' | 'LOCKED' | 'DEACTIVATED';
  role: Role;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export type Role = 'PICKER' | 'COUNTER' | 'MANAGER';
export interface User {
  id: string;
  displayName: string;
  phoneNormalized: string | null;
  emailNormalized?: string | null;
  avatarUrl?: string | null;
  accountType?: 'USER' | 'SELLER' | 'STAFF';
  ownedStores?: Store[];
  isAdmin: boolean;
  canRefund: boolean;
  memberships: { storeId: string; role: Role }[];
}
export interface CartItem {
  originalPrice?: number;
  skuId: string;
  name: string;
  code: string;
  unit: string;
  price: number;
  quantity: number;
  available: number;
  imageUrl?: string | null;
}
export interface Cart {
  id: string;
  storeId: string;
  version: number;
  items: CartItem[];
}
export interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  allocatedCount: number;
  available: number;
  version: number;
}
export interface Totals {
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
}
export type PaymentMethod = 'ONLINE' | 'PAY_AT_PICKUP';
export type PaymentPlan = 'FULL_ONLINE' | 'DEPOSIT_15' | 'LEGACY_PAY_AT_PICKUP';
export interface PaymentBreakdown {
  paymentMethod: PaymentMethod;
  paymentPlan: PaymentPlan;
  depositPercent: number;
  depositAmount: number;
  amountDueNow: number;
  remainingAmount: number;
}
export interface Quote {
  id: string;
  cartVersion: number;
  expiresAt: string;
  totals: Totals;
  paymentPlan?: PaymentPlan;
  depositPercent?: number;
  depositAmount?: number;
  amountDueNow?: number;
  remainingAmount?: number;
  paymentOptions?: PaymentBreakdown[];
}
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PICKING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';
export interface OrderItem {
  originalUnitPrice?: number | null;
  id: string;
  skuId: string;
  skuCode: string;
  name: string;
  quantity: number;
  pickedQuantity: number;
  unitPrice: number;
  lineTotal: number;
  barcode: string | null;
}
export interface Order {
  voucherCode?: string | null;
  id: string;
  code: string;
  storeId: string;
  userId: string;
  status: OrderStatus;
  paymentStatus?: string;
  paymentMethod: PaymentMethod;
  paymentPlan?: PaymentPlan;
  depositPercent?: number;
  depositAmount?: number;
  amountDueNow?: number;
  remainingAmount?: number;
  amountPaid?: number;
  amountRefunded?: number;
  amountRemaining?: number;
  total: number;
  subtotal: number;
  discount: number;
  fee: number;
  version: number;
  createdAt: string;
  expiresAt: string | null;
  items?: OrderItem[];
  slot?: Slot;
  store?: Store;
  timeline?: {
    fromStatus: string | null;
    toStatus: OrderStatus;
    reason: string;
    createdAt: string;
  }[];
  refunds?: { id: string; amount: number; status: string }[];
}
export interface Inventory {
  id: string;
  skuId: string;
  code: string;
  name: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
}
export interface Report {
  completedOrders: number;
  completedOrderValue: number;
  onlineCollected: number;
  cashCollected: number;
  refunded: number;
}
export interface Proposal {
  id: string;
  expectedCartVersion: number;
  confirmationToken: string;
  items: { skuId: string; name: string; quantity: number; unitPrice: number }[];
  addedTotal: number;
  cartTotal: number;
  expiresAt: string;
}
