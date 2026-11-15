'use client';
import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { ErrorBox, Empty, Loading, Modal } from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { useShop } from '@/store/shop';
import type { Role, StaffAccount } from '@/types';

const roleLabels: Record<Role, string> = {
  PICKER: 'Nhân viên soạn hàng',
  COUNTER: 'Nhân viên quầy nhận',
  MANAGER: 'Quản lý cửa hàng',
};

export function StaffManagement({ base }: { base: string }) {
  const shop = useShop();
  const staff = useResource<StaffAccount[]>(`${base}/staff`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [created, setCreated] = useState<StaffAccount | null>(null),
    [resetTarget, setResetTarget] = useState<StaffAccount | null>(null),
    [newPassword, setNewPassword] = useState(''),
    [passwordConfirmation, setPasswordConfirmation] = useState(''),
    [passwordVisible, setPasswordVisible] = useState(false),
    [resetBusy, setResetBusy] = useState(false),
    [resetError, setResetError] = useState<unknown>(null);

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form),
      value = (name: string) => String(values.get(name) ?? '').trim(),
      phone = value('phone'),
      email = value('email');
    if (!phone && !email) {
      setError(new Error('Nhập ít nhất số điện thoại hoặc email để nhân viên đăng nhập.'));
      return;
    }
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const account = await api<StaffAccount>(`${base}/staff`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: {
          displayName: value('displayName'),
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
          password: value('password'),
          role: value('role'),
        },
      });
      form.reset();
      setCreated(account);
      staff.refresh();
      shop.notice(`Đã cấp tài khoản cho ${account.displayName}.`);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  function openPasswordReset(account: StaffAccount) {
    setResetTarget(account);
    setNewPassword('');
    setPasswordConfirmation('');
    setPasswordVisible(false);
    setResetError(null);
  }

  function closePasswordReset() {
    setResetTarget(null);
    setNewPassword('');
    setPasswordConfirmation('');
    setPasswordVisible(false);
    setResetError(null);
  }

  async function resetStaffPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    if (newPassword.length < 12) {
      setResetError(new Error('Mật khẩu mới cần ít nhất 12 ký tự.'));
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setResetError(new Error('Mật khẩu xác nhận chưa trùng khớp.'));
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await api(`${base}/staff/${resetTarget.id}/password`, {
        method: 'PATCH',
        token: shop.token,
        body: { password: newPassword },
      });
      shop.notice(`Đã đặt lại mật khẩu cho ${resetTarget.displayName}.`);
      setResetTarget(null);
      setNewPassword('');
      setPasswordConfirmation('');
      setPasswordVisible(false);
    } catch (caught) {
      setResetError(caught);
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <section className="staff-management-grid">
      <form className="panel form-stack" onSubmit={(event) => void createStaff(event)}>
        <div className="form-section-title">
          <UserPlus size={20} />
          <h2>Cấp tài khoản nhân viên</h2>
        </div>
        <div className="info-note">
          Nhân viên không tự đăng ký. Manager hoặc Admin tạo tài khoản ban đầu rồi bàn giao thông
          tin đăng nhập trực tiếp cho nhân viên.
        </div>
        <label>
          Tên nhân viên
          <input name="displayName" required minLength={2} maxLength={200} autoComplete="name" />
        </label>
        <div className="grid-2">
          <label>
            Số điện thoại
            <input
              name="phone"
              type="tel"
              maxLength={40}
              autoComplete="tel"
              placeholder="0901234567"
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              maxLength={254}
              autoComplete="email"
              placeholder="nhanvien@email.com"
            />
          </label>
        </div>
        <small>Chỉ cần một trong hai thông tin liên hệ; đây cũng là tên đăng nhập.</small>
        <label>
          Mật khẩu ban đầu
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Ít nhất 12 ký tự"
          />
        </label>
        <label>
          Vai trò
          <select name="role" defaultValue="PICKER" required>
            <option value="PICKER">Nhân viên soạn hàng</option>
            <option value="COUNTER">Nhân viên quầy nhận</option>
            {shop.user?.isAdmin && <option value="MANAGER">Quản lý cửa hàng</option>}
          </select>
        </label>
        <small>
          Manager chỉ cấp được quyền Soạn hàng hoặc Quầy nhận. Chỉ Admin hệ thống mới được cấp thêm
          quyền Manager.
        </small>
        <ErrorBox error={error} />
        {created && (
          <div className="info-note staff-created" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Đã cấp tài khoản cho {created.displayName}</strong>
              <small>
                Hãy bàn giao thông tin đăng nhập và mật khẩu ban đầu qua kênh riêng, an toàn.
              </small>
            </div>
          </div>
        )}
        <button className="button" disabled={busy}>
          <UserPlus size={17} />
          {busy ? 'Đang cấp tài khoản…' : 'Cấp tài khoản nhân viên'}
        </button>
      </form>

      <div className="panel staff-list-panel">
        <div className="panel-heading">
          <div>
            <h2>Nhân sự tại cửa hàng</h2>
            <small>Tài khoản và vai trò đang được cấp tại cửa hàng đã chọn</small>
          </div>
          <span className="badge">
            <UsersRound size={13} /> {staff.data?.length ?? 0}
          </span>
        </div>
        <ErrorBox error={staff.error} retry={staff.refresh} />
        {staff.loading && !staff.data ? (
          <Loading label="Đang tải danh sách nhân sự…" />
        ) : !staff.data?.length ? (
          <Empty title="Cửa hàng chưa có tài khoản nhân viên">
            <p>Dùng biểu mẫu bên cạnh để cấp tài khoản đầu tiên.</p>
          </Empty>
        ) : (
          <div className="staff-account-list">
            {staff.data.map((account) => {
              const canResetPassword =
                account.accountType === 'STAFF' &&
                account.id !== shop.user?.id &&
                (account.role !== 'MANAGER' || !!shop.user?.isAdmin);
              return (
                <article className="staff-account-card" key={`${account.id}:${account.role}`}>
                  <span className="staff-account-icon">
                    <ShieldCheck size={20} />
                  </span>
                  <div>
                    <div className="row wrap">
                      <h3>{account.displayName}</h3>
                      <span className="badge">{roleLabels[account.role]}</span>
                    </div>
                    <div className="staff-contact-list">
                      {account.phoneNormalized && (
                        <span>
                          <Phone size={13} /> {account.phoneNormalized}
                        </span>
                      )}
                      {account.emailNormalized && (
                        <span>
                          <Mail size={13} /> {account.emailNormalized}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="staff-card-actions">
                    <span className={`staff-status ${account.status.toLowerCase()}`}>
                      {account.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm khóa'}
                    </span>
                    {canResetPassword && (
                      <button
                        type="button"
                        className="staff-password-button"
                        aria-label={`Đặt lại mật khẩu cho ${account.displayName}`}
                        onClick={() => openPasswordReset(account)}
                      >
                        <KeyRound size={14} /> Đặt lại mật khẩu
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <Modal
        open={!!resetTarget}
        onClose={closePasswordReset}
        title={`Đặt lại mật khẩu cho ${resetTarget?.displayName ?? 'nhân viên'}`}
      >
        <form
          className="form-stack staff-password-form"
          onSubmit={(event) => void resetStaffPassword(event)}
        >
          <div className="info-note">
            Sau khi đổi mật khẩu, mọi phiên đăng nhập hiện tại của nhân viên sẽ bị đóng. Hãy bàn
            giao mật khẩu mới qua kênh riêng, an toàn.
          </div>
          <div className="password-form-field">
            <label htmlFor="staff-new-password">Mật khẩu mới</label>
            <div className="password-field">
              <input
                id="staff-new-password"
                type={passwordVisible ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                autoFocus
                required
                aria-describedby="staff-password-hint"
              />
              <button
                type="button"
                aria-label={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <small id="staff-password-hint">
              Dùng ít nhất 12 ký tự và không chia sẻ qua kênh công khai.
            </small>
          </div>
          <label>
            Xác nhận mật khẩu mới
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <ErrorBox error={resetError} />
          <div className="staff-password-actions">
            <button
              type="button"
              className="button secondary"
              disabled={resetBusy}
              onClick={closePasswordReset}
            >
              Hủy
            </button>
            <button className="button" disabled={resetBusy}>
              <KeyRound size={17} />
              {resetBusy ? 'Đang đổi mật khẩu…' : 'Xác nhận đổi mật khẩu'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
