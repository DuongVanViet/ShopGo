'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  Camera,
  Check,
  LogOut,
  Monitor,
  Moon,
  Phone,
  ShieldCheck,
  Store,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AccountAvatar } from '@/components/account-avatar';
import { AccessGate, ErrorBox, PageTitle } from '@/components/ui';
import { api, messageOf } from '@/lib/api';
import { useShop } from '@/store/shop';
import { useTheme, type ThemePreference } from '@/store/theme';
import type { Role, User } from '@/types';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const roleNames: Record<Role, string> = {
  MANAGER: 'Quản lý cửa hàng',
  PICKER: 'Nhân viên soạn hàng',
  COUNTER: 'Nhân viên quầy nhận',
};

function accountLabel(user: User): string {
  if (user.isAdmin) return 'Quản trị viên hệ thống';
  if (user.accountType === 'SELLER') return 'Chủ cửa hàng';
  if (user.accountType === 'STAFF') {
    const roles = Array.from(
      new Set(user.memberships.map((membership) => roleNames[membership.role])),
    );
    return roles.join(' · ') || 'Nhân viên cửa hàng';
  }
  return 'Khách hàng ShopGo';
}

export function AccountView() {
  const shop = useShop();
  if (!shop.user) {
    return (
      <AccessGate>
        <></>
      </AccessGate>
    );
  }
  return <AccountSettings user={shop.user} />;
}

function AccountSettings({ user }: { user: User }) {
  const shop = useShop();
  const theme = useTheme();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [phone, setPhone] = useState(user.phoneNormalized ?? '');
  const [email, setEmail] = useState(user.emailNormalized ?? '');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setDisplayName(user.displayName);
    setPhone(user.phoneNormalized ?? '');
    setEmail(user.emailNormalized ?? '');
  }, [user.displayName, user.emailNormalized, user.phoneNormalized]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) return setError(new Error('Vui lòng nhập họ và tên.'));
    if (!phone.trim() && !email.trim())
      return setError(new Error('Vui lòng giữ lại ít nhất số điện thoại hoặc email.'));
    setSaving(true);
    setError(null);
    try {
      const updated = await api<User>('/me', {
        method: 'PATCH',
        token: shop.token,
        body: {
          displayName: displayName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        },
      });
      shop.updateUser(updated);
      shop.notice('Đã lưu thông tin hồ sơ.');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError(new Error('Ảnh đại diện phải là tệp JPEG, PNG hoặc WebP.'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(new Error('Ảnh đại diện không được vượt quá 5 MB.'));
      return;
    }
    const body = new FormData();
    body.append('avatar', file);
    setAvatarBusy(true);
    setError(null);
    try {
      const updated = await api<User>('/me/avatar', {
        method: 'POST',
        token: shop.token,
        body,
      });
      shop.updateUser(updated);
      shop.notice('Đã cập nhật ảnh đại diện.');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setError(null);
    try {
      const updated = await api<User>('/me/avatar', {
        method: 'DELETE',
        token: shop.token,
      });
      shop.updateUser(updated);
      shop.notice('Đã xóa ảnh đại diện.');
    } catch (nextError) {
      setError(nextError);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function logout() {
    try {
      await shop.logout();
      router.push('/');
    } catch (nextError) {
      shop.notice(messageOf(nextError), true);
    }
  }

  const storeIds = new Set(user.memberships.map((membership) => membership.storeId));
  const relatedStores = [
    ...(user.ownedStores ?? []),
    ...shop.stores.filter((store) => storeIds.has(store.id)),
  ].filter(
    (store, index, stores) => stores.findIndex((candidate) => candidate.id === store.id) === index,
  );

  return (
    <AccessGate>
      <div className="container account-page">
        <PageTitle
          eyebrow="TÀI KHOẢN CỦA TÔI"
          title="Hồ sơ cá nhân"
          subtitle="Quản lý cách ShopGo hiển thị và liên hệ với bạn."
        />
        <div className="account-layout">
          <aside className="panel account-summary-card">
            <div className="account-avatar-wrap">
              <AccountAvatar name={user.displayName} avatarUrl={user.avatarUrl} size="large" />
              <button
                type="button"
                className="avatar-camera-button"
                aria-label="Chọn ảnh đại diện"
                disabled={avatarBusy}
                onClick={() => fileInput.current?.click()}
              >
                <Camera size={17} />
              </button>
            </div>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              name="avatar"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void uploadAvatar(event)}
            />
            <h2>{user.displayName}</h2>
            <span className="account-role-badge">
              <ShieldCheck size={14} /> {accountLabel(user)}
            </span>
            <p className="muted">JPEG, PNG hoặc WebP · tối đa 5 MB</p>
            <div className="account-avatar-actions">
              <button
                type="button"
                className="button secondary small"
                disabled={avatarBusy}
                onClick={() => fileInput.current?.click()}
              >
                <Camera size={15} />{' '}
                {avatarBusy ? 'Đang xử lý…' : user.avatarUrl ? 'Thay ảnh' : 'Tải ảnh lên'}
              </button>
              {user.avatarUrl && (
                <button
                  type="button"
                  className="button text-danger small"
                  disabled={avatarBusy}
                  onClick={() => void removeAvatar()}
                >
                  <Trash2 size={15} /> Xóa ảnh
                </button>
              )}
            </div>
            {(relatedStores.length > 0 || user.isAdmin) && (
              <div className="account-store-context">
                <strong>
                  <Store size={16} /> Phạm vi làm việc
                </strong>
                {user.isAdmin && <span>Toàn hệ thống ShopGo</span>}
                {relatedStores.map((store) => (
                  <span key={store.id}>{store.name}</span>
                ))}
              </div>
            )}
          </aside>

          <div className="account-settings-stack">
            <form
              className="panel form-stack account-profile-form"
              onSubmit={(event) => void save(event)}
            >
              <div className="panel-heading">
                <div>
                  <h2>Thông tin cơ bản</h2>
                  <small>Thông tin dùng cho tài khoản và thông báo đơn hàng.</small>
                </div>
                <UserRound size={22} />
              </div>
              <label>
                Họ và tên
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  minLength={2}
                  maxLength={200}
                  autoComplete="name"
                  required
                />
              </label>
              <div className="grid-2">
                <label>
                  <span className="field-label-icon">
                    <Phone size={14} /> Số điện thoại
                  </span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={40}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0901 234 567"
                  />
                </label>
                <label>
                  <span className="field-label-icon">
                    <AtSign size={14} /> Email
                  </span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    maxLength={254}
                    type="email"
                    autoComplete="email"
                    placeholder="ban@example.com"
                  />
                </label>
              </div>
              <small>Giữ lại ít nhất một phương thức liên hệ.</small>
              <ErrorBox error={error} />
              <div className="account-form-actions">
                <button className="button" disabled={saving || avatarBusy}>
                  <Check size={17} /> {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>

            <section className="panel account-theme-card" aria-labelledby="appearance-title">
              <div className="panel-heading">
                <div>
                  <h2 id="appearance-title">Giao diện</h2>
                  <small>Chọn nền sáng, nền tối hoặc theo thiết bị.</small>
                </div>
                {theme.resolvedTheme === 'dark' ? <Moon size={22} /> : <Sun size={22} />}
              </div>
              <div className="theme-options" role="radiogroup" aria-label="Giao diện">
                <ThemeOption
                  value="light"
                  current={theme.preference}
                  label="Sáng"
                  description="Dễ đọc ban ngày"
                  icon={<Sun size={20} />}
                  onSelect={theme.setPreference}
                />
                <ThemeOption
                  value="dark"
                  current={theme.preference}
                  label="Tối"
                  description="Dịu mắt buổi tối"
                  icon={<Moon size={20} />}
                  onSelect={theme.setPreference}
                />
                <ThemeOption
                  value="system"
                  current={theme.preference}
                  label="Theo thiết bị"
                  description="Tự đổi theo hệ thống"
                  icon={<Monitor size={20} />}
                  onSelect={theme.setPreference}
                />
              </div>
            </section>

            <section className="panel account-session-card">
              <div>
                <h2>Phiên đăng nhập</h2>
                <p className="muted">Đăng xuất khỏi tài khoản trên trình duyệt này.</p>
              </div>
              <button type="button" className="button secondary" onClick={() => void logout()}>
                <LogOut size={17} /> Đăng xuất
              </button>
            </section>
          </div>
        </div>
      </div>
    </AccessGate>
  );
}

function ThemeOption({
  value,
  current,
  label,
  description,
  icon,
  onSelect,
}: {
  value: ThemePreference;
  current: ThemePreference;
  label: string;
  description: string;
  icon: React.ReactNode;
  onSelect: (value: ThemePreference) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={selected ? 'selected' : ''}
      onClick={() => onSelect(value)}
    >
      <span>{icon}</span>
      <strong>{label}</strong>
      <small>{description}</small>
      {selected && <Check className="theme-option-check" size={16} />}
    </button>
  );
}
