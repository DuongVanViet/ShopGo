import { fail, must } from './errors';
import { Actor } from './context';
import { one, Tx } from '../database/db';

export async function storeAccess(
  tx: Pick<Tx, 'query'>,
  actor: Actor,
  storeId: string,
  roles: string[],
): Promise<void> {
  if (actor.is_admin) return;
  const acceptedRoles = new Set(roles);
  if (roles.some((role) => role === 'PICKER' || role === 'COUNTER')) acceptedRoles.add('MANAGER');
  const membership = await one(
    tx,
    'SELECT 1 FROM store_memberships WHERE user_id=$1 AND store_id=$2 AND role=ANY($3::text[])',
    [actor.id, storeId, [...acceptedRoles]],
  );
  if (!membership) fail('STORE_SCOPE_DENIED', 'Bạn không có quyền thao tác tại cửa hàng này.', 403);
}
export async function ownOrder(
  tx: Pick<Tx, 'query'>,
  actor: Actor,
  orderId: string,
  lock = false,
): Promise<any> {
  const order = must(
    await one(tx, `SELECT * FROM orders WHERE id=$1 AND user_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [
      orderId,
      actor.id,
    ]),
  );
  return order;
}
export function expected(row: Record<string, unknown>, value: number): void {
  if (row.version !== value) fail('VERSION_CONFLICT', 'Dữ liệu đã thay đổi. Vui lòng tải lại.');
}
export function admin(actor: Actor): void {
  if (!actor.is_admin) fail('FORBIDDEN', 'Cần quyền quản trị hệ thống.', 403);
}
