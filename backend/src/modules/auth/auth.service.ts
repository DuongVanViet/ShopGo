import { Inject, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Db, one, Tx } from '../../database/db';
import { ENV, Env } from '../../config/env';
import { constantEqual, hash, hmac, randomToken } from '../../common/crypto';
import { fail, must } from '../../common/errors';
import { Actor } from '../../common/context';
import { audit } from '../../common/events';
import { fullAddress, normalizePhone, ProfileUpdate, Registration } from './auth.dto';
import { hashPassword, verifyPassword } from './password';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_URL_PREFIX = '/api/v1/media/avatars/';
export interface AvatarUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function avatarType(file: AvatarUpload): { extension: 'jpg' | 'png' | 'webp'; mime: string } {
  const mime = file.mimetype.toLowerCase();
  const bytes = file.buffer;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mime === 'image/jpeg' && jpeg) return { extension: 'jpg', mime };
  if (mime === 'image/png' && png) return { extension: 'png', mime };
  if (mime === 'image/webp' && webp) return { extension: 'webp', mime };
  fail('INVALID_AVATAR', 'Ảnh đại diện phải là tệp JPEG, PNG hoặc WebP hợp lệ.', 422);
}

@Injectable()
export class AuthService {
  private readonly avatarDirectory: string;
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.avatarDirectory = resolve(env.UPLOAD_DIR, 'avatars');
  }
  async register(input: Registration, ip: string, requestId: string) {
    const allowed = await this.db.tx((tx) => this.rate(tx, `register-ip:${hash(ip)}`, 12, 3600));
    if (!allowed)
      fail('RATE_LIMITED', 'Bạn đã gửi nhiều yêu cầu đăng ký. Vui lòng thử lại sau.', 429);
    const passwordHash = await hashPassword(input.password);
    return this.db.tx(async (tx) => {
      const duplicate = await one(
        tx,
        'SELECT id FROM users WHERE ($1::text IS NOT NULL AND phone_normalized=$1) OR ($2::text IS NOT NULL AND email_normalized=$2)',
        [input.phone ?? null, input.email ?? null],
      );
      if (duplicate)
        fail('ACCOUNT_EXISTS', 'Thông tin đăng ký đã được sử dụng. Vui lòng đăng nhập.', 409);
      const user = must(
        await one(
          tx,
          `INSERT INTO users(display_name,phone_normalized,email_normalized,password_hash,account_type)
        VALUES($1,$2,$3,$4,$5) RETURNING id,account_type`,
          [
            input.accountType === 'USER' ? input.name : input.storeName,
            input.phone ?? null,
            input.email ?? null,
            passwordHash,
            input.accountType,
          ],
        ),
      );
      let storeId: string | undefined;
      if (input.accountType === 'SELLER') {
        const loc = input.location;
        const store = must(
          await one(
            tx,
            `INSERT INTO stores(code,name,address,owner_user_id,contact_phone,contact_email,address_details,latitude,longitude,location_source,location_accuracy_meters,location_confirmed_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp()) RETURNING id`,
            [
              `SG-${randomUUID()}`,
              input.storeName,
              fullAddress(input.address),
              user.id,
              input.phone,
              input.email,
              JSON.stringify(input.address),
              loc.latitude,
              loc.longitude,
              loc.source,
              loc.source === 'GPS' ? (loc.accuracyMeters ?? null) : null,
            ],
          ),
        );
        storeId = store.id;
        await tx.query(
          "INSERT INTO store_memberships(user_id,store_id,role) VALUES($1,$2,'MANAGER')",
          [user.id, storeId],
        );
      }
      await audit(tx, user.id, 'auth.register', 'user', user.id, requestId, {
        accountType: input.accountType,
        storeId,
      });
      return { ...(await this.session(tx, user.id)), accountType: input.accountType, storeId };
    });
  }
  async passwordLogin(identifier: string, password: string, ip: string) {
    const normalized = identifier.includes('@')
      ? identifier.trim().toLowerCase()
      : normalizePhone(identifier);
    const allowed = await this.db.tx(async (tx) => {
      const byIp = await this.rate(tx, `login-ip:${hash(ip)}`, 40, 600);
      const byIdentity = await this.rate(tx, `login-identity:${hash(normalized)}`, 12, 600);
      return byIp && byIdentity;
    });
    if (!allowed) fail('RATE_LIMITED', 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.', 429);
    const user = await one(
      this.db.pool,
      'SELECT id,password_hash,status FROM users WHERE email_normalized=$1 OR phone_normalized=$1',
      [normalized],
    );
    const valid = await verifyPassword(password, user?.password_hash ?? null);
    if (!valid || !user || user.status !== 'ACTIVE')
      fail('INVALID_CREDENTIALS', 'Số điện thoại/email hoặc mật khẩu không đúng.', 401);
    return this.db.tx(async (tx) => {
      const current = await one(
        tx,
        "SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND password_hash=$2 FOR SHARE",
        [user.id, user.password_hash],
      );
      if (!current)
        fail('INVALID_CREDENTIALS', 'Số điện thoại/email hoặc mật khẩu không đúng.', 401);
      return this.session(tx, user.id);
    });
  }
  async rate(tx: Tx, key: string, maximum: number, seconds: number) {
    const row = await one(
      tx,
      `INSERT INTO rate_limits(key,count,resets_at) VALUES($1,1,clock_timestamp()+$2*interval '1 second')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<=clock_timestamp() THEN 1 ELSE rate_limits.count+1 END,
      resets_at=CASE WHEN rate_limits.resets_at<=clock_timestamp() THEN clock_timestamp()+$2*interval '1 second' ELSE rate_limits.resets_at END RETURNING count`,
      [key, seconds],
    );
    return row!.count <= maximum;
  }
  async requestOtp(phone: string, ip: string) {
    if (this.env.OTP_MODE !== 'local')
      fail('OTP_UNAVAILABLE', 'Chưa cấu hình nhà cung cấp OTP.', 503);
    const code = String(randomInt(100000, 1000000));
    const result = await this.db.tx(async (tx) => {
      const ipAllowed = await this.rate(tx, `otp-ip:${hash(ip)}`, 20, 600);
      const phoneAllowed = await this.rate(tx, `otp-phone:${phone}`, 3, 600);
      if (!ipAllowed || !phoneAllowed) return null;
      const challenge = await one(
        tx,
        `INSERT INTO otp_challenges(phone_normalized,code_hash,expires_at) VALUES($1,$2,clock_timestamp()+$3*interval '1 second') RETURNING id,expires_at`,
        [phone, hmac(this.env.AUTH_SECRET, `${phone}:${code}`), this.env.OTP_TTL_SECONDS],
      );
      return { challengeId: challenge!.id, expiresAt: challenge!.expires_at, localCode: code };
    });
    if (!result) fail('RATE_LIMITED', 'Vui lòng chờ trước khi yêu cầu mã mới.', 429);
    return result;
  }
  async verify(challengeId: string, code: string, ip: string) {
    const result = await this.db.tx(async (tx) => {
      if (!(await this.rate(tx, `verify-ip:${hash(ip)}`, 50, 600)))
        return { error: 'RATE_LIMITED' };
      const challenge = await one(
        tx,
        'SELECT *, expires_at>clock_timestamp() AS valid FROM otp_challenges WHERE id=$1 FOR UPDATE',
        [challengeId],
      );
      if (!challenge || challenge.used_at || !challenge.valid || challenge.attempts >= 5)
        return { error: 'INVALID_OTP' };
      await tx.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1', [challengeId]);
      if (
        !constantEqual(
          challenge.code_hash,
          hmac(this.env.AUTH_SECRET, `${challenge.phone_normalized}:${code}`),
        )
      )
        return { error: 'INVALID_OTP' };
      await tx.query('UPDATE otp_challenges SET used_at=clock_timestamp() WHERE id=$1', [
        challengeId,
      ]);
      const user = await one(
        tx,
        `INSERT INTO users(phone_normalized,display_name) VALUES($1,'Khách hàng') ON CONFLICT(phone_normalized) DO UPDATE SET updated_at=now() RETURNING *`,
        [challenge.phone_normalized],
      );
      if (user!.status !== 'ACTIVE') return { error: 'ACCOUNT_UNAVAILABLE' };
      return this.session(tx, user!.id);
    });
    if ('error' in result)
      fail(
        result.error!,
        'Không thể xác thực mã OTP.',
        result.error === 'RATE_LIMITED' ? 429 : 401,
      );
    return result;
  }
  private async session(tx: Tx, userId: string) {
    const token = randomToken();
    const session = await one(
      tx,
      `INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+$3*interval '1 second') RETURNING expires_at`,
      [userId, hash(token), this.env.SESSION_TTL_SECONDS],
    );
    return { accessToken: token, tokenType: 'Bearer', expiresAt: session!.expires_at };
  }
  async authenticate(token: string): Promise<Actor> {
    return must(
      await one<Actor>(
        this.db.pool,
        `SELECT u.id,u.is_admin,u.can_refund,s.id AS session_id FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND u.status='ACTIVE'`,
        [hash(token)],
      ),
      'AUTH_REQUIRED',
      'Phiên đăng nhập không hợp lệ.',
      401,
    );
  }
  async me(actor: Actor) {
    const user = must(
      await one(
        this.db.pool,
        `SELECT id,display_name,phone_normalized,email_normalized,account_type,is_admin,can_refund,
         CASE WHEN avatar_storage_key IS NULL THEN NULL ELSE '${AVATAR_URL_PREFIX}'||avatar_storage_key END AS avatar_url
         FROM users WHERE id=$1`,
        [actor.id],
      ),
    );
    return {
      ...user,
      ownedStores: (
        await this.db.pool.query(
          'SELECT id,code,name,address,latitude,longitude FROM stores WHERE owner_user_id=$1 ORDER BY created_at',
          [actor.id],
        )
      ).rows,
      memberships: (
        await this.db.pool.query('SELECT store_id,role FROM store_memberships WHERE user_id=$1', [
          actor.id,
        ])
      ).rows,
    };
  }
  async updateProfile(actor: Actor, input: ProfileUpdate, requestId: string) {
    try {
      await this.db.tx(async (tx) => {
        const current = must(
          await one<{
            display_name: string;
            phone_normalized: string | null;
            email_normalized: string | null;
          }>(
            tx,
            'SELECT display_name,phone_normalized,email_normalized FROM users WHERE id=$1 FOR UPDATE',
            [actor.id],
          ),
        );
        const displayName = input.displayName ?? current.display_name;
        const phone = input.phone === undefined ? current.phone_normalized : input.phone;
        const email = input.email === undefined ? current.email_normalized : input.email;
        if (!phone && !email)
          fail(
            'PROFILE_CONTACT_REQUIRED',
            'Hãy giữ lại ít nhất một số điện thoại hoặc email.',
            400,
          );
        const duplicate = await one(
          tx,
          `SELECT id FROM users WHERE id<>$1 AND
           (($2::text IS NOT NULL AND phone_normalized=$2) OR
            ($3::text IS NOT NULL AND email_normalized=$3))`,
          [actor.id, phone, email],
        );
        if (duplicate)
          fail(
            'PROFILE_CONTACT_EXISTS',
            'Số điện thoại hoặc email đã được sử dụng bởi tài khoản khác.',
            409,
          );
        await tx.query(
          `UPDATE users SET display_name=$2,phone_normalized=$3,email_normalized=$4,updated_at=clock_timestamp()
           WHERE id=$1`,
          [actor.id, displayName, phone, email],
        );
        await audit(tx, actor.id, 'profile.update', 'user', actor.id, requestId, {
          displayNameChanged: displayName !== current.display_name,
          phoneChanged: phone !== current.phone_normalized,
          emailChanged: email !== current.email_normalized,
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        fail(
          'PROFILE_CONTACT_EXISTS',
          'Số điện thoại hoặc email đã được sử dụng bởi tài khoản khác.',
          409,
        );
      throw error;
    }
    return this.me(actor);
  }
  async uploadAvatar(actor: Actor, file: AvatarUpload | undefined, requestId: string) {
    if (!file?.buffer?.length) fail('AVATAR_REQUIRED', 'Vui lòng chọn một ảnh đại diện.', 400);
    if (file.size !== file.buffer.length || file.size > MAX_AVATAR_BYTES)
      fail('AVATAR_TOO_LARGE', 'Ảnh đại diện không được vượt quá 5 MB.', 413);
    const type = avatarType(file);
    const storageKey = `${randomUUID()}.${type.extension}`;
    const temporaryPath = join(this.avatarDirectory, `.${storageKey}.tmp`);
    const finalPath = join(this.avatarDirectory, storageKey);
    let previousStorageKey: string | null = null;
    await mkdir(this.avatarDirectory, { recursive: true });
    try {
      await writeFile(temporaryPath, file.buffer, { flag: 'wx' });
      await rename(temporaryPath, finalPath);
      await this.db.tx(async (tx) => {
        const current = must(
          await one<{ avatar_storage_key: string | null }>(
            tx,
            'SELECT avatar_storage_key FROM users WHERE id=$1 FOR UPDATE',
            [actor.id],
          ),
        );
        previousStorageKey = current.avatar_storage_key;
        await tx.query(
          'UPDATE users SET avatar_storage_key=$2,updated_at=clock_timestamp() WHERE id=$1',
          [actor.id, storageKey],
        );
        await audit(tx, actor.id, 'profile.avatar.upload', 'user', actor.id, requestId, {
          mimeType: type.mime,
          byteSize: file.size,
        });
      });
      if (previousStorageKey && previousStorageKey !== storageKey)
        await unlink(join(this.avatarDirectory, previousStorageKey)).catch(() => undefined);
      return this.me(actor);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      await unlink(finalPath).catch(() => undefined);
      throw error;
    }
  }
  async removeAvatar(actor: Actor, requestId: string) {
    let previousStorageKey: string | null = null;
    await this.db.tx(async (tx) => {
      const current = must(
        await one<{ avatar_storage_key: string | null }>(
          tx,
          'SELECT avatar_storage_key FROM users WHERE id=$1 FOR UPDATE',
          [actor.id],
        ),
      );
      previousStorageKey = current.avatar_storage_key;
      if (!previousStorageKey) return;
      await tx.query(
        'UPDATE users SET avatar_storage_key=NULL,updated_at=clock_timestamp() WHERE id=$1',
        [actor.id],
      );
      await audit(tx, actor.id, 'profile.avatar.remove', 'user', actor.id, requestId);
    });
    if (previousStorageKey)
      await unlink(join(this.avatarDirectory, previousStorageKey)).catch(() => undefined);
    return this.me(actor);
  }
  async refresh(actor: Actor) {
    return this.db.tx(async (tx) => {
      const old = await one(
        tx,
        'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() RETURNING id',
        [actor.session_id],
      );
      if (!old) fail('SESSION_EXPIRED', 'Phiên đã được thay thế.', 401);
      return this.session(tx, actor.id);
    });
  }
  async logout(actor: Actor, requestId: string) {
    return this.db.tx(async (tx) => {
      await tx.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1', [
        actor.session_id,
      ]);
      await audit(tx, actor.id, 'auth.logout', 'session', actor.session_id, requestId);
      return { loggedOut: true };
    });
  }
}
