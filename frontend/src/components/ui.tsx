'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, LoaderCircle, PackageOpen, X } from 'lucide-react';
import { ApiError, messageOf } from '@/lib/api';
import { canAccessStoreRole } from '@/lib/access';
import { statuses } from '@/lib/format';
import { useShop } from '@/store/shop';
import type { OrderStatus, Role } from '@/types';

export function Loading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" />
      {label}
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>{messageOf(error)}</strong>
        {error instanceof ApiError && error.requestId && (
          <small>Mã hỗ trợ: {error.requestId}</small>
        )}
        {retry && (
          <button className="text-button" onClick={retry}>
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <PackageOpen size={42} strokeWidth={1.3} />
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
export function Badge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <i />
      {statuses[status]}
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="Đóng" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
export function AccessGate({
  roles,
  admin,
  children,
}: {
  roles?: Role[];
  admin?: boolean;
  children: ReactNode;
}) {
  const { user, store, openAuth } = useShop();
  const allowed =
    user && (!admin || user.isAdmin) && (!roles || canAccessStoreRole(user, store?.id, roles));
  if (!allowed)
    return (
      <div className="container narrow gate">
        <Empty title={user ? 'Tài khoản chưa có quyền tại cửa hàng này' : 'Đăng nhập để tiếp tục'}>
          <p>
            {admin
              ? 'Khu vực dành cho quản trị hệ thống.'
              : roles
                ? 'Chọn tài khoản nhân sự đúng vai trò và cửa hàng để thao tác.'
                : 'Giỏ hàng và đơn hàng được lưu riêng cho tài khoản của bạn.'}
          </p>
          <button className="button" onClick={openAuth}>
            {user ? 'Đổi tài khoản' : 'Đăng nhập'} <ArrowRight size={17} />
          </button>
          {!user && (
            <p className="auth-switch">
              Chưa có tài khoản? <Link href="/register">Đăng ký ngay</Link>
            </p>
          )}
        </Empty>
      </div>
    );
  return <>{children}</>;
}
