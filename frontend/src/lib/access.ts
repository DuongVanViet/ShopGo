import type { Role, User } from '@/types';

export interface NavigationItem {
  href: string;
  label: string;
}

const customerNavigation: NavigationItem[] = [
  { href: '/', label: 'Cửa hàng' },
  { href: '/don-hang', label: 'Đơn của tôi' },
];

export function isCustomerUser(user: User | null | undefined): boolean {
  return !!user && user.accountType === 'USER' && !user.isAdmin && user.memberships.length === 0;
}

export function navigationForUser(
  user: User | null | undefined,
  hasOperationalStore = true,
): NavigationItem[] {
  if (!user) return customerNavigation;
  if (isCustomerUser(user))
    return [...customerNavigation, { href: '/tin-nhan', label: 'Tin nhắn' }];
  const roles = new Set(user.memberships.map((membership) => membership.role));
  const manager = user.accountType === 'SELLER' || roles.has('MANAGER');
  const items: NavigationItem[] = [];
  const adminAtStore = user.isAdmin && hasOperationalStore;
  if (adminAtStore || manager || roles.has('PICKER'))
    items.push({ href: '/soan-hang', label: 'Soạn hàng' });
  if (adminAtStore || manager || roles.has('COUNTER'))
    items.push({ href: '/nhan-hang', label: 'Quầy nhận' });
  if (adminAtStore || manager) items.push({ href: '/quan-ly', label: 'Quản lý cửa hàng' });
  if (user.isAdmin) items.push({ href: '/he-thong', label: 'Quản trị' });
  return items;
}

export function canAccessStoreRole(
  user: User | null | undefined,
  storeId: string | null | undefined,
  roles: Role[],
): boolean {
  if (!user || !storeId) return false;
  if (user.isAdmin) return true;
  return user.memberships.some(
    (membership) =>
      membership.storeId === storeId &&
      (roles.includes(membership.role) ||
        (membership.role === 'MANAGER' &&
          roles.some((role) => role === 'PICKER' || role === 'COUNTER'))),
  );
}

export function landingForUser(user: User): string {
  if (user.isAdmin) return '/he-thong';
  if (
    user.accountType === 'SELLER' ||
    user.memberships.some((membership) => membership.role === 'MANAGER')
  )
    return '/quan-ly';
  if (user.memberships.some((membership) => membership.role === 'PICKER')) return '/soan-hang';
  if (user.memberships.some((membership) => membership.role === 'COUNTER')) return '/nhan-hang';
  return '/';
}
