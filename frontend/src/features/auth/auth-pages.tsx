'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  MapPin,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { api } from '@/lib/api';
import { landingForUser } from '@/lib/access';
import { useShop } from '@/store/shop';
import { ErrorBox, Loading } from '@/components/ui';
import { AddressFields } from '@/components/maps/address-fields';
import type { LocationPin, StoreAddress } from '@/types/location';

const LocationPicker = dynamic(() => import('@/components/maps/location-picker'), {
  ssr: false,
  loading: () => <Loading label="Đang mở bản đồ…" />,
});
const emptyAddress: StoreAddress = { street: '', ward: '', district: '', city: '' };
function PasswordField({
  value,
  onChange,
  creating = false,
}: {
  value: string;
  onChange: (value: string) => void;
  creating?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="password-form-field">
      <label htmlFor={id}>Mật khẩu</label>
      <div className="password-field">
        <input
          id={id}
          aria-describedby={creating ? `${id}-hint` : undefined}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={creating ? 'new-password' : 'current-password'}
          minLength={creating ? 12 : 1}
          maxLength={128}
          required
          placeholder={creating ? 'Tạo mật khẩu ít nhất 12 ký tự' : 'Nhập mật khẩu của bạn'}
        />
        <button
          type="button"
          aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          onClick={() => setVisible((old) => !old)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {creating && <small id={`${id}-hint`}>12–128 ký tự. Mật khẩu được băm trước khi lưu.</small>}
    </div>
  );
}
function AuthLayout({ register, children }: { register?: boolean; children: ReactNode }) {
  return (
    <div className="container auth-container">
      <div className="auth-layout">
        <aside className="auth-story">
          <span className="auth-story-icon">
            <ShoppingBag size={32} />
          </span>
          <p className="eyebrow">MỘT TÀI KHOẢN, NHIỀU ĐIỀU TIỆN LỢI</p>
          <h1>
            {register ? (
              <>
                Bắt đầu cùng <br />
                <em>ShopGo.</em>
              </>
            ) : (
              <>
                Rất vui được <br />
                <em>gặp lại bạn.</em>
              </>
            )}
          </h1>
          <p>
            {register
              ? 'Mua những món mình cần, hoặc đưa cửa hàng của bạn đến gần khách hàng hơn.'
              : 'Giỏ hàng, cửa hàng và những đơn mua đều đang chờ bạn.'}
          </p>
          <div className="auth-story-points">
            <span>
              <ShoppingBag size={18} />
              Khách hàng chọn món và nhận theo giờ
            </span>
            <span>
              <Store size={18} />
              Người bán quản lý cửa hàng của mình
            </span>
            <span>
              <MapPin size={18} />
              Vị trí cửa hàng được ghim ngay trong app
            </span>
          </div>
          <span className="auth-story-leaf">
            <Leaf size={90} strokeWidth={1} />
          </span>
        </aside>
        <section className="auth-form-panel">{children}</section>
      </div>
    </div>
  );
}
export function LoginPage() {
  const shop = useShop(),
    router = useRouter(),
    initialUser = useRef(shop.user?.id ?? null);
  const [identifier, setIdentifier] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (shop.user && shop.user.id !== initialUser.current)
      router.replace(landingForUser(shop.user));
  }, [shop.user, router]);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { identifier, password },
      });
      const user = await shop.login(session.accessToken);
      setPassword('');
      router.replace(landingForUser(user));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
      <h2>Đăng nhập</h2>
      <p className="muted auth-intro">Dùng số điện thoại hoặc email đã đăng ký.</p>
      <div className="info-note">
        Nhân viên cửa hàng đăng nhập bằng tài khoản do Manager hoặc Admin cấp; nhân viên không tự
        đăng ký tài khoản vận hành.
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          Số điện thoại hoặc email
          <input
            name="identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            placeholder="0901234567 hoặc ban@email.com"
            required
            maxLength={254}
          />
        </label>
        <PasswordField value={password} onChange={setPassword} />
        <ErrorBox error={error} />
        <button className="button wide" disabled={busy}>
          <LockKeyhole size={17} />
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập tài khoản'}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">
        Chưa có tài khoản? <Link href="/register">Đăng ký ngay</Link>
      </p>
      {process.env.NEXT_PUBLIC_DEMO_MODE !== 'false' && (
        <div className="auth-demo">
          <small>Muốn thử nhanh các vai trò bằng OTP local?</small>
          <button type="button" className="text-button" onClick={shop.openDemoAuth}>
            Dùng tài khoản mẫu <ArrowRight size={15} />
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
export function RegisterPage() {
  const shop = useShop(),
    router = useRouter();
  const [accountType, setAccountType] = useState<'USER' | 'SELLER'>('USER'),
    [step, setStep] = useState(1),
    [contactMethod, setContactMethod] = useState<'phone' | 'email'>('phone');
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [address, setAddress] = useState<StoreAddress>(emptyAddress),
    [location, setLocation] = useState<LocationPin | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  function choose(type: 'USER' | 'SELLER') {
    setAccountType(type);
    setStep(1);
    setError(null);
  }
  async function submit() {
    if (accountType === 'SELLER' && step === 1) {
      setStep(2);
      setError(null);
      return;
    }
    if (accountType === 'SELLER' && (!location || !confirmed)) {
      setError(new Error('Hãy ghim và xác nhận đúng vị trí cửa hàng trước khi đăng ký.'));
      return;
    }
    const body =
      accountType === 'USER'
        ? {
            accountType,
            name,
            [contactMethod]: contactMethod === 'phone' ? phone : email,
            password,
          }
        : {
            accountType,
            storeName: name,
            phone,
            email,
            password,
            address,
            location: { ...location, confirmed: true },
          };
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ accessToken: string }>('/auth/register', { method: 'POST', body });
      const user = await shop.login(result.accessToken);
      setPassword('');
      shop.notice(
        accountType === 'SELLER'
          ? 'Đã tạo tài khoản và lưu vị trí cửa hàng.'
          : 'Tài khoản của bạn đã sẵn sàng.',
      );
      router.replace(landingForUser(user));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout register>
      <p className="eyebrow">CHÀO BẠN ĐẾN VỚI SHOPGO</p>
      <h2>{step === 2 ? 'Cửa hàng của bạn ở đâu?' : 'Tạo tài khoản'}</h2>
      <p className="muted auth-intro">
        {step === 2
          ? 'Điền địa chỉ cụ thể, sau đó kiểm tra ghim trên bản đồ.'
          : 'Chọn cách bạn muốn đồng hành cùng ShopGo.'}
      </p>
      {step === 1 && (
        <div className="info-note">
          Biểu mẫu này chỉ dành cho khách hàng hoặc chủ cửa hàng. Tài khoản nhân viên phải do
          Manager/Admin của cửa hàng cấp.
        </div>
      )}
      <div className="account-types" aria-label="Loại tài khoản">
        <button
          type="button"
          className={accountType === 'USER' ? 'selected' : ''}
          aria-pressed={accountType === 'USER'}
          disabled={busy}
          onClick={() => choose('USER')}
        >
          <ShoppingBag size={21} />
          <strong>Khách hàng</strong>
          <small>Mua sắm cho mình</small>
        </button>
        <button
          type="button"
          className={accountType === 'SELLER' ? 'selected' : ''}
          aria-pressed={accountType === 'SELLER'}
          disabled={busy}
          onClick={() => choose('SELLER')}
        >
          <Store size={21} />
          <strong>Người bán / cửa hàng</strong>
          <small>Mở cửa hàng trên ShopGo</small>
        </button>
      </div>
      {accountType === 'SELLER' && (
        <div className="registration-steps">
          <span className={step === 1 ? 'active' : ''}>
            <b>{step === 2 ? <Check size={12} /> : '1'}</b>Thông tin cơ bản
          </span>
          <i />
          <span className={step === 2 ? 'active' : ''}>
            <b>2</b>Địa chỉ & vị trí
          </span>
        </div>
      )}
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {step === 1 && (
          <>
            <label>
              {accountType === 'SELLER' ? 'Tên cửa hàng' : 'Họ và tên'}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete={accountType === 'SELLER' ? 'organization' : 'name'}
                required
                minLength={2}
                maxLength={200}
                placeholder={
                  accountType === 'SELLER' ? 'Tên quán / cửa hàng của bạn' : 'Tên của bạn'
                }
              />
            </label>
            {accountType === 'USER' && (
              <div className="contact-method">
                <button
                  type="button"
                  className={contactMethod === 'phone' ? 'active' : ''}
                  onClick={() => setContactMethod('phone')}
                >
                  Dùng số điện thoại
                </button>
                <button
                  type="button"
                  className={contactMethod === 'email' ? 'active' : ''}
                  onClick={() => setContactMethod('email')}
                >
                  Dùng email
                </button>
              </div>
            )}
            {(accountType === 'SELLER' || contactMethod === 'phone') && (
              <label>
                Số điện thoại
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  required
                  maxLength={40}
                  placeholder="0901234567"
                />
              </label>
            )}
            {(accountType === 'SELLER' || contactMethod === 'email') && (
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="ban@email.com"
                />
              </label>
            )}
            <PasswordField value={password} onChange={setPassword} creating />
          </>
        )}
        {step === 2 && (
          <>
            <div className="info-note">
              <strong>{name}</strong>
              <p>
                {phone} · {email}
              </p>
            </div>
            <AddressFields
              value={address}
              onChange={(value) => {
                setAddress(value);
                setConfirmed(false);
              }}
            />
            <LocationPicker
              value={location}
              onChange={(value) => {
                setLocation(value);
                setConfirmed(false);
              }}
            />
            <label className="location-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
                disabled={!location}
              />
              Tôi đã kiểm tra ghim nằm đúng vị trí cửa hàng thực tế.
            </label>
          </>
        )}
        <ErrorBox error={error} />
        <button
          className="button wide"
          disabled={busy || (step === 2 && (!location || !confirmed))}
        >
          {busy
            ? 'Đang tạo tài khoản…'
            : accountType === 'SELLER' && step === 1
              ? 'Tiếp tục: địa chỉ & bản đồ'
              : accountType === 'SELLER'
                ? 'Tạo tài khoản cửa hàng'
                : 'Đăng ký tài khoản'}
          <ArrowRight size={17} />
        </button>
        {step === 2 && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setStep(1);
              setError(null);
            }}
          >
            <ArrowLeft size={15} />
            Sửa thông tin cơ bản
          </button>
        )}
      </form>
      <p className="auth-switch">
        Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
      </p>
    </AuthLayout>
  );
}
