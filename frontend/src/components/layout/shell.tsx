'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Leaf,
  LogOut,
  MapPin,
  ShoppingBag,
  Moon,
  Sun,
} from 'lucide-react';
import { useShop } from '@/store/shop';
import { useTheme } from '@/store/theme';
import { AccountAvatar } from '@/components/account-avatar';
import { StoreLocationDialog } from '@/components/maps/store-location-dialog';
import { isCustomerUser, landingForUser, navigationForUser } from '@/lib/access';
import { AuthDialog } from '../auth-dialog';
import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
  const shop = useShop(),
    path = usePathname();
  const theme = useTheme();
  const total = shop.cart?.items.reduce((n, item) => n + item.quantity, 0) ?? 0;
  const canChoosePickupStore = isCustomerUser(shop.user);
  const customerExperience = !shop.user || canChoosePickupStore;
  const homeHref = shop.user ? landingForUser(shop.user) : '/';
  const navigation = navigationForUser(shop.user, !!shop.store);
  return (
    <>
      <div className="announcement">
        <span>
          <Leaf size={14} /> Mua sắm theo nhịp sống của bạn.
        </span>
        <Link href="/huong-dan">
          Khám phá Click & Collect <ArrowUpRight size={13} />
        </Link>
      </div>
      <header className="header">
        <div
          className={`container header-top ${canChoosePickupStore ? '' : 'without-store-select'}`}
        >
          <Link
            href={homeHref}
            className="brand"
            aria-label={customerExperience ? 'ShopGo trang chủ' : 'ShopGo trang làm việc'}
          >
            <span className="brand-mark">
              <ShoppingBag size={25} />
            </span>
            Shop<span>Go</span>
            <i />
          </Link>
          {canChoosePickupStore && (
            <div className="store-select" data-testid="customer-store-select">
              <MapPin size={20} />
              <div className="store-select-copy">
                <span>Nhận hàng tại</span>
                <select
                  aria-label="Chọn cửa hàng"
                  value={shop.store?.id ?? ''}
                  onChange={(e) => shop.setStore(e.target.value)}
                >
                  <option value="">Tất cả cửa hàng</option>
                  {shop.stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
                {shop.store && <small>{shop.store.address}</small>}
              </div>
              <ChevronDown size={14} />
              {shop.store && <StoreLocationDialog key={shop.store.id} store={shop.store} />}
            </div>
          )}
          <div className="header-actions">
            <button
              type="button"
              className="icon-button theme-quick-toggle"
              onClick={theme.toggleTheme}
              title={
                theme.resolvedTheme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'
              }
              aria-label={
                theme.resolvedTheme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'
              }
            >
              {theme.resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {shop.user ? (
              <Link
                href="/tai-khoan"
                className={`account-button ${path === '/tai-khoan' ? 'active' : ''}`}
                aria-label={`Hồ sơ của ${shop.user.displayName}`}
                aria-current={path === '/tai-khoan' ? 'page' : undefined}
              >
                <AccountAvatar name={shop.user.displayName} avatarUrl={shop.user.avatarUrl} />
                <span>{shop.user.displayName}</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="account-button login-link" aria-label="Đăng nhập">
                  <AccountAvatar name="" />
                  <span>Đăng nhập</span>
                </Link>
                <Link href="/register" className="register-button">
                  Đăng ký
                </Link>
              </>
            )}
            {shop.user && (
              <button
                title="Đăng xuất"
                aria-label="Đăng xuất"
                className="icon-button"
                onClick={() =>
                  void shop.logout().catch(() => shop.notice('Đã đóng phiên trên trình duyệt.'))
                }
              >
                <LogOut size={17} />
              </button>
            )}
            {customerExperience && (
              <Link href="/gio-hang" aria-label={`Giỏ hàng ${total}`} className="cart-button">
                <ShoppingBag size={18} />
                <span>Giỏ hàng</span>
                <b data-testid="cart-count">{total}</b>
              </Link>
            )}
          </div>
        </div>
        <nav className="container nav" aria-label="Điều hướng chính">
          {navigation.map((item) => (
            <Link
              key={item.href}
              className={
                path === item.href || (item.href === '/don-hang' && path.startsWith('/don-hang/'))
                  ? 'active'
                  : ''
              }
              href={item.href}
              aria-current={
                path === item.href || (item.href === '/don-hang' && path.startsWith('/don-hang/'))
                  ? 'page'
                  : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="footer container">
        <Link className="brand" href={homeHref}>
          Shop<span>Go</span>
          <i />
        </Link>
        <p>Chọn điều tươi ngon. Dành thời gian cho điều quan trọng.</p>
        <span>Click. Collect. Enjoy.</span>
      </footer>
      {shop.toast && (
        <div
          className={`toast ${shop.toast.error ? 'toast-error' : ''}`}
          role={shop.toast.error ? 'alert' : 'status'}
        >
          <CheckCircle2 size={20} />
          {shop.toast.text}
        </div>
      )}
      <AuthDialog />
    </>
  );
}
