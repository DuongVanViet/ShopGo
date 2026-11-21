'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  Bell,
  Boxes,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Heart,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  PackageSearch,
  Search,
  ShoppingCart,
  Store,
  Sun,
  Tags,
} from 'lucide-react';
import { useShop } from '@/store/shop';
import { useTheme } from '@/store/theme';
import { AccountAvatar } from '@/components/account-avatar';
import { StoreLocationDialog } from '@/components/maps/store-location-dialog';
import { StorePicker } from '@/components/store-picker';
import { isCustomerUser, landingForUser, navigationForUser } from '@/lib/access';
import { AuthDialog } from '../auth-dialog';

function NavigationIcon({ href }: { href: string }) {
  if (href === '/') return <Home size={18} aria-hidden="true" />;
  if (href === '/don-hang') return <PackageSearch size={18} aria-hidden="true" />;
  if (href === '/tin-nhan') return <MessageCircle size={18} aria-hidden="true" />;
  if (href === '/soan-hang') return <Boxes size={18} aria-hidden="true" />;
  if (href === '/nhan-hang') return <ClipboardList size={18} aria-hidden="true" />;
  return <Store size={18} aria-hidden="true" />;
}

export function Shell({ children }: { children: ReactNode }) {
  const shop = useShop(),
    path = usePathname(),
    router = useRouter();
  const theme = useTheme();
  const [headerSearch, setHeaderSearch] = useState(''),
    [headerSearchScope, setHeaderSearchScope] = useState<'all' | 'store'>('all');
  const authPath = path === '/login' || path === '/register';
  const total = shop.cart?.items.reduce((n, item) => n + item.quantity, 0) ?? 0;
  const canChoosePickupStore = isCustomerUser(shop.user);
  const customerExperience = !shop.user || canChoosePickupStore;
  const operationalPage =
    ['/soan-hang', '/nhan-hang', '/quan-ly'].includes(path) ||
    (path === '/tin-nhan' && !customerExperience);
  const homeHref = shop.user ? landingForUser(shop.user) : '/';
  const navigation = navigationForUser(shop.user, !!shop.store);
  useEffect(() => {
    if (!shop.store && headerSearchScope === 'store') setHeaderSearchScope('all');
  }, [shop.store, headerSearchScope]);
  function submitHeaderSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = headerSearch.trim();
    const scope = headerSearchScope === 'store' && shop.store ? 'store' : 'all';
    if (path === '/') {
      window.dispatchEvent(
        new CustomEvent('shopgo:header-search', { detail: { query: value, scope } }),
      );
      document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    router.push(`/?q=${encodeURIComponent(value)}&scope=${scope}#san-pham`);
  }
  return (
    <>
      <header
        className={`header retail-header ${authPath ? 'auth-header' : customerExperience ? 'customer-header' : ''}`}
      >
        <div
          className={`container header-top retail-header-top ${authPath ? 'auth-header-top' : canChoosePickupStore ? '' : 'without-store-select'}`}
        >
          <Link
            href={homeHref}
            className="brand"
            aria-label={customerExperience ? 'ShopGo trang chủ' : 'ShopGo trang làm việc'}
          >
            <span className="brand-mark">
              <ShoppingCart size={27} />
            </span>
            <span className="brand-copy">
              <strong>
                Shop<span>Go</span>
              </strong>
              <small>{customerExperience ? 'Siêu thị online' : 'Trung tâm vận hành'}</small>
            </span>
          </Link>
          {authPath ? (
            <div className="auth-header-actions">
              <Link href="/" className="auth-home-link" aria-label="Trang chủ">
                <Home size={17} />
                <span>Trang chủ</span>
              </Link>
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
              <Link href={path === '/login' ? '/register' : '/login'} className="auth-header-cta">
                {path === '/login' ? 'Tạo tài khoản' : 'Đăng nhập'}
              </Link>
            </div>
          ) : (
            <>
              {canChoosePickupStore && (
                <div className="store-select" data-testid="customer-store-select">
                  <StorePicker
                    onSelect={() => {
                      if (path === '/')
                        window.dispatchEvent(new Event('shopgo:pickup-store-selected'));
                    }}
                  />
                  {shop.store && <StoreLocationDialog key={shop.store.id} store={shop.store} />}
                </div>
              )}
              {customerExperience && (
                <form className="retail-global-search" role="search" onSubmit={submitHeaderSearch}>
                  <Search size={19} aria-hidden="true" />
                  <select
                    aria-label="Phạm vi tìm kiếm nhanh"
                    value={headerSearchScope === 'store' && shop.store ? 'store' : 'all'}
                    onChange={(event) =>
                      setHeaderSearchScope(event.target.value as 'all' | 'store')
                    }
                  >
                    <option value="all">Tất cả cửa hàng</option>
                    {shop.store && <option value="store">Trong {shop.store.name}</option>}
                  </select>
                  <input
                    value={headerSearch}
                    onChange={(event) => setHeaderSearch(event.target.value)}
                    aria-label="Tìm nhanh sản phẩm"
                    placeholder={
                      headerSearchScope === 'store' && shop.store
                        ? `Tìm trong ${shop.store.name}…`
                        : 'Tìm sản phẩm trên toàn ShopGo…'
                    }
                  />
                  <button type="submit" aria-label="Tìm kiếm">
                    <Search size={20} />
                  </button>
                </form>
              )}
              <div className="header-actions">
                {customerExperience && (
                  <Link
                    href="/yeu-thich"
                    className="retail-header-action retail-favorites-link"
                    aria-label="Yêu thích"
                    aria-current={path === '/yeu-thich' ? 'page' : undefined}
                  >
                    <Heart size={20} aria-hidden="true" />
                    <span>Yêu thích</span>
                  </Link>
                )}
                {shop.user && customerExperience && (
                  <button
                    type="button"
                    className="icon-button retail-notification"
                    aria-label="Thông báo · Sắp ra mắt"
                    title="Thông báo · Sắp ra mắt"
                    onClick={() => shop.notice('Trung tâm thông báo đang được hoàn thiện.')}
                  >
                    <Bell size={19} />
                  </button>
                )}
                {customerExperience && (
                  <Link
                    href="/gio-hang"
                    aria-label={`Giỏ hàng ${total}`}
                    aria-current={path === '/gio-hang' ? 'page' : undefined}
                    className="cart-button"
                  >
                    <ShoppingCart size={20} />
                    <span>Giỏ hàng</span>
                    <b data-testid="cart-count">{total}</b>
                  </Link>
                )}
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
                    <Link
                      href="/login"
                      className="account-button login-link"
                      aria-label="Đăng nhập"
                    >
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
              </div>
            </>
          )}
        </div>
        {!authPath && (
          <div className="retail-nav-row">
            <div className="container retail-nav-inner">
              <nav className="nav" aria-label="Điều hướng chính">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    className={
                      path === item.href ||
                      (item.href === '/don-hang' && path.startsWith('/don-hang/'))
                        ? 'active'
                        : ''
                    }
                    href={item.href}
                    aria-current={
                      path === item.href ||
                      (item.href === '/don-hang' && path.startsWith('/don-hang/'))
                        ? 'page'
                        : undefined
                    }
                  >
                    <NavigationIcon href={item.href} />
                    {item.label}
                  </Link>
                ))}
              </nav>
              {customerExperience && (
                <div className="retail-nav-extras" aria-label="Tiện ích mua sắm">
                  <button
                    type="button"
                    onClick={() => {
                      if (!shop.store) {
                        shop.notice('Hãy chọn cửa hàng để xem ưu đãi.');
                        return;
                      }
                      if (path !== '/') {
                        router.push('/?scope=store#uu-dai');
                        return;
                      }
                      window.dispatchEvent(
                        new CustomEvent('shopgo:header-search', {
                          detail: { query: '', scope: 'store' },
                        }),
                      );
                      requestAnimationFrame(() =>
                        document.getElementById('uu-dai')?.scrollIntoView({ behavior: 'smooth' }),
                      );
                    }}
                  >
                    <Tags size={17} /> Ưu đãi
                  </button>
                  <Link href="/huong-dan">
                    <CircleHelp size={17} /> Hướng dẫn
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
      <main id="main-content" key={operationalPage ? shop.store?.id : undefined}>
        {operationalPage &&
          !customerExperience &&
          !shop.user?.isAdmin &&
          shop.stores.length > 1 && (
            <div className="container operational-store-switch">
              <label>
                <Store size={18} aria-hidden="true" />
                Cửa hàng làm việc
                <select
                  value={shop.store?.id ?? ''}
                  onChange={(event) => {
                    const store = shop.stores.find(({ id }) => id === event.target.value);
                    if (store) shop.setStore(store);
                  }}
                >
                  {shop.stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        {children}
      </main>
      {!authPath && (
        <footer className="footer retail-footer">
          <div className="container retail-footer-inner">
            <Link className="brand" href={homeHref}>
              <span className="brand-mark">
                <ShoppingCart size={24} />
              </span>
              <span className="brand-copy">
                <strong>
                  Shop<span>Go</span>
                </strong>
                <small>Siêu thị online</small>
              </span>
            </Link>
            <p>Đặt hàng trước · Chọn giờ nhận · Không cần xếp hàng.</p>
            <Link href="/huong-dan">Hướng dẫn Click & Collect</Link>
          </div>
        </footer>
      )}
      {shop.toast && (
        <div
          className={`toast ${shop.toast.error ? 'toast-error' : ''}`}
          role={shop.toast.error ? 'alert' : 'status'}
        >
          {shop.toast.error ? (
            <AlertCircle size={20} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={20} aria-hidden="true" />
          )}
          {shop.toast.text}
        </div>
      )}
      <AuthDialog />
    </>
  );
}
