'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  LogIn,
  ShoppingBag,
  ClipboardList,
  ScanLine,
  Store,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { landingForUser } from '@/lib/access';
import { useShop } from '@/store/shop';
import { ErrorBox, Modal } from './ui';

const demos = [
  { name: 'Khách hàng', phone: '+84900000000', icon: ShoppingBag },
  { name: 'Soạn hàng', phone: '+84900000001', icon: ClipboardList },
  { name: 'Quầy nhận', phone: '+84900000002', icon: ScanLine },
  { name: 'Quản lý', phone: '+84900000003', icon: Store },
  { name: 'Admin', phone: '+84900000004', icon: ShieldCheck },
];
export function AuthDialog() {
  const shop = useShop();
  const router = useRouter();
  const [phone, setPhone] = useState('+84900000000'),
    [code, setCode] = useState(''),
    [challenge, setChallenge] = useState<{ challengeId: string; localCode?: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (shop.authOpen) {
      setChallenge(null);
      setError(null);
      setCode('');
    }
  }, [shop.authOpen]);
  async function request(demo = false, selectedPhone = phone) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ challengeId: string; localCode?: string }>('/auth/otp/request', {
        method: 'POST',
        body: { phone: selectedPhone },
      });
      setPhone(selectedPhone);
      setChallenge(result);
      if (demo && result.localCode) await verify(result.challengeId, result.localCode);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function verify(challengeId: string, value: string) {
    const result = await api<{ accessToken: string }>('/auth/otp/verify', {
      method: 'POST',
      body: { challengeId, code: value },
    });
    const user = await shop.login(result.accessToken);
    router.replace(landingForUser(user));
  }
  return (
    <Modal open={shop.authOpen} onClose={shop.closeAuth} title="Trải nghiệm bằng tài khoản mẫu">
      <p className="muted">Chọn vai trò để thử ShopGo trong môi trường thử nghiệm.</p>
      {process.env.NEXT_PUBLIC_DEMO_MODE !== 'false' && (
        <section className="demo-accounts">
          <span className="eyebrow">TÀI KHOẢN TRẢI NGHIỆM</span>
          <div className="demo-grid">
            {demos.map(({ name, phone, icon: Icon }) => (
              <button key={phone} disabled={busy} onClick={() => request(true, phone)}>
                <Icon size={20} />
                <span>{name}</span>
                {shop.user?.phoneNormalized === phone && <Check size={14} />}
              </button>
            ))}
          </div>
          <small>
            Mỗi nút đăng nhập bằng tài khoản mẫu. Mã chỉ được điền tự động khi backend bật OTP
            local.
          </small>
        </section>
      )}
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!challenge) {
            void request();
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await verify(challenge.challengeId, code);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Số điện thoại
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setChallenge(null);
            }}
            placeholder="+84901234567"
            required
            pattern="\+[1-9][0-9]{7,14}"
          />
        </label>
        {challenge && (
          <>
            <label>
              Mã xác thực
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
              />
            </label>
            {challenge.localCode && (
              <div className="info-note">
                Mã thử nghiệm: <strong>{challenge.localCode}</strong>
              </div>
            )}
          </>
        )}
        <ErrorBox error={error} />
        <button className="button wide" disabled={busy}>
          <LogIn size={18} />
          {busy ? 'Đang đăng nhập…' : challenge ? 'Xác nhận đăng nhập' : 'Nhận mã xác thực'}
          <ArrowRight size={18} />
        </button>
      </form>
      <div className="auth-switch">
        <Link href="/login" onClick={shop.closeAuth}>
          Đăng nhập bằng mật khẩu
        </Link>{' '}
        ·{' '}
        <Link href="/register" onClick={shop.closeAuth}>
          Đăng ký tài khoản
        </Link>
      </div>
    </Modal>
  );
}
