import { z } from 'zod';

export function normalizePhone(value: string): string {
  const clean = value.trim().replace(/[\s().-]/g, '');
  if (/^0\d{9}$/.test(clean)) return `+84${clean.slice(1)}`;
  if (/^84\d{9}$/.test(clean)) return `+${clean}`;
  return clean;
}
export const phoneSchema = z
  .string()
  .max(40)
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Số điện thoại không hợp lệ.'));
export const emailSchema = z.string().trim().toLowerCase().max(254).email('Email không hợp lệ.');
export const passwordSchema = z
  .string()
  .min(12, 'Mật khẩu cần ít nhất 12 ký tự.')
  .max(128, 'Mật khẩu tối đa 128 ký tự.');
export const addressSchema = z
  .object({
    street: z.string().trim().min(3).max(250),
    ward: z.string().trim().min(2).max(120),
    district: z.string().trim().max(120).optional(),
    city: z.string().trim().min(2).max(120),
  })
  .strict();
export const locationSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    source: z.enum(['GPS', 'MAP', 'COORDINATES']),
    accuracyMeters: z.number().finite().min(0).max(100000).optional(),
    confirmed: z.literal(true),
  })
  .strict();
export const registerSchema = z.discriminatedUnion('accountType', [
  z
    .object({
      accountType: z.literal('USER'),
      name: z.string().trim().min(2).max(200),
      phone: phoneSchema.optional(),
      email: emailSchema.optional(),
      password: passwordSchema,
    })
    .strict()
    .refine((input) => !!input.phone || !!input.email, {
      message: 'Nhập số điện thoại hoặc email.',
      path: ['phone'],
    }),
  z
    .object({
      accountType: z.literal('SELLER'),
      storeName: z.string().trim().min(2).max(200),
      phone: phoneSchema,
      email: emailSchema,
      password: passwordSchema,
      address: addressSchema,
      location: locationSchema,
    })
    .strict(),
]);
export const loginSchema = z
  .object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(128) })
  .strict();
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(200).optional(),
    phone: phoneSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.displayName !== undefined || input.phone !== undefined || input.email !== undefined,
    { message: 'Cần có ít nhất một thông tin để cập nhật.' },
  );
export const updateLocationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    address: addressSchema,
    location: locationSchema,
  })
  .strict();
export type Registration = z.infer<typeof registerSchema>;
export type ProfileUpdate = z.infer<typeof updateProfileSchema>;
export type StoreAddress = z.infer<typeof addressSchema>;
export function fullAddress(address: StoreAddress): string {
  return [address.street, address.ward, address.district, address.city].filter(Boolean).join(', ');
}
