import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { id, money, parse, uuid, version } from '../../common/validation';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  ManagementService,
  ProductImageUpload,
} from './management.service';
import { Public } from '../auth/auth.guard';
import { emailSchema, passwordSchema, phoneSchema } from '../auth/auth.dto';

const reportSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict();
const sellerCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/)
      .max(100)
      .optional(),
  })
  .strict();
const sellerProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    categoryId: uuid,
    sku: z
      .object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9._-]+$/),
        barcode: z.string().trim().min(1).max(100).optional(),
        name: z.string().trim().min(1).max(200),
        unit: z.enum(['piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bottle', 'case', 'multipack']),
      })
      .strict(),
    price: money.refine((value) => value > 0, 'Giá bán phải lớn hơn 0.'),
    initialStock: z.number().int().min(0).max(1_000_000_000),
    expiresOn: z.string().date().nullable().optional(),
  })
  .strict();
const sellerProductUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    categoryId: uuid,
    sku: z
      .object({
        code: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[A-Za-z0-9._-]+$/),
        barcode: z.string().trim().min(1).max(100).nullable(),
        name: z.string().trim().min(1).max(200),
        unit: z.enum(['piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bottle', 'case', 'multipack']),
      })
      .strict(),
    price: money.refine((value) => value > 0, 'Giá bán phải lớn hơn 0.'),
    active: z.boolean(),
    expiresOn: z.string().date().nullable(),
    discount: z
      .object({
        price: money.refine((value) => value > 0),
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .nullable()
      .optional(),
    expectedVersion: version,
  })
  .strict();
const staffAccountSchema = z
  .object({
    displayName: z.string().trim().min(2).max(200),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema,
    role: z.enum(['PICKER', 'COUNTER', 'MANAGER']),
  })
  .strict()
  .refine((input) => !!input.phone || !!input.email, {
    message: 'Nhập số điện thoại hoặc email cho nhân viên.',
    path: ['phone'],
  });
const schemas: Record<string, z.ZodTypeAny> = {
  store: z
    .object({
      code: z.string().min(2).max(40),
      name: z.string().min(1).max(200),
      address: z.string().min(1).max(500),
    })
    .strict(),
  category: z
    .object({
      name: z.string().min(1).max(100),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(100),
    })
    .strict(),
  membership: z
    .object({ userId: uuid, storeId: uuid, role: z.enum(['PICKER', 'COUNTER', 'MANAGER']) })
    .strict(),
  product: z
    .object({
      name: z.string().min(1).max(200),
      description: z.string().max(5000).optional(),
      categoryId: uuid.optional(),
      sku: z
        .object({
          code: z.string().min(1).max(100),
          barcode: z.string().min(1).max(100).optional(),
          name: z.string().min(1).max(200),
          unit: z.string().min(1).max(30).default('piece'),
        })
        .strict(),
      storeId: uuid,
      price: money,
      initialStock: z.number().int().min(0).max(1_000_000_000),
    })
    .strict(),
  voucher: z
    .object({
      code: z.string().regex(/^[A-Za-z0-9_-]{2,40}$/),
      storeId: uuid.optional(),
      discountType: z.enum(['FIXED', 'PERCENT']),
      value: money.refine((v) => v > 0),
      maxDiscount: money.optional(),
      minTotal: money.default(0),
      quota: z.number().int().min(0).max(1_000_000),
      validFrom: z.string().datetime({ offset: true }),
      validUntil: z.string().datetime({ offset: true }),
    })
    .strict(),
};
@ApiBearerAuth()
@ApiTags('Management')
@Controller()
export class ManagementController {
  constructor(@Inject(ManagementService) private readonly management: ManagementService) {}
  private create(a: Actor, kind: string, b: unknown, k: string | undefined, r: ApiRequest) {
    return this.management.adminCreate(a, kind, parse(schemas[kind], b), k, r.requestId);
  }
  @Post('admin/stores') store(
    @CurrentActor() a: Actor,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.create(a, 'store', b, k, r);
  }
  @Post('admin/categories') category(
    @CurrentActor() a: Actor,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.create(a, 'category', b, k, r);
  }
  @Post('admin/memberships') membership(
    @CurrentActor() a: Actor,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.create(a, 'membership', b, k, r);
  }
  @Post('admin/products') product(
    @CurrentActor() a: Actor,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.create(a, 'product', b, k, r);
  }
  @Post('admin/vouchers') voucher(
    @CurrentActor() a: Actor,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.create(a, 'voucher', b, k, r);
  }
  @Public() @Get('categories') categories() {
    return this.management.categories();
  }
  @Get('stores/:storeId/catalog/categories') catalogCategories(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
  ) {
    return this.management.catalogCategories(actor, id(storeId));
  }
  @Post('stores/:storeId/catalog/categories') createCatalogCategory(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.management.createCatalogCategory(
      actor,
      id(storeId),
      parse(sellerCategorySchema, body),
      key,
      request.requestId,
    );
  }
  @Get('stores/:storeId/catalog/products') catalogProducts(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Query() query: unknown,
  ) {
    return this.management.catalogProducts(
      actor,
      id(storeId),
      parse(
        z
          .object({
            limit: z.coerce.number().int().min(1).max(100).default(20),
            cursor: uuid.optional(),
          })
          .strict(),
        query,
      ),
    );
  }
  @Post('stores/:storeId/catalog/products') createCatalogProduct(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.management.createCatalogProduct(
      actor,
      id(storeId),
      parse(sellerProductSchema, body),
      key,
      request.requestId,
    );
  }
  @Patch('stores/:storeId/catalog/products/:skuId')
  updateCatalogProduct(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Param('skuId') skuId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.management.updateCatalogProduct(
      actor,
      id(storeId),
      id(skuId),
      parse(sellerProductUpdateSchema, body),
      key,
      request.requestId,
    );
  }
  @Post('stores/:storeId/catalog/products/:productId/image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 1 },
    }),
  )
  uploadCatalogProductImage(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @UploadedFile() image: ProductImageUpload | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.management.uploadCatalogProductImage(
      actor,
      id(storeId),
      id(productId),
      image,
      request.requestId,
    );
  }
  @Get('stores/:storeId/staff') staffAccounts(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
  ) {
    return this.management.staffAccounts(actor, id(storeId));
  }
  @Post('stores/:storeId/staff') createStaffAccount(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.management.createStaffAccount(
      actor,
      id(storeId),
      parse(staffAccountSchema, body),
      key,
      request.requestId,
    );
  }
  @Patch('stores/:storeId/staff/:userId/password') resetStaffPassword(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: ApiRequest,
  ) {
    const input = parse(z.object({ password: passwordSchema }).strict(), body);
    return this.management.resetStaffPassword(
      actor,
      id(storeId),
      id(userId),
      input.password,
      request.requestId,
    );
  }
  @Put('stores/:storeId/products/:skuId') price(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('skuId') sku: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.management.updateProduct(
      a,
      id(s),
      id(sku),
      parse(z.object({ price: money, active: z.boolean(), expectedVersion: version }).strict(), b),
      k,
      r.requestId,
    );
  }
  @Post('stores/:storeId/slots') slot(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.management.slot(
      a,
      id(s),
      parse(
        z
          .object({
            startsAt: z.string().datetime({ offset: true }),
            endsAt: z.string().datetime({ offset: true }),
            capacity: z.number().int().min(0).max(10000),
          })
          .strict(),
        b,
      ),
      k,
      r.requestId,
    );
  }
  @Patch('stores/:storeId/slots/:slotId') capacity(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('slotId') slot: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.management.slot(
      a,
      id(s),
      parse(
        z
          .object({ capacity: z.number().int().min(0).max(10000), expectedVersion: version })
          .strict(),
        b,
      ),
      k,
      r.requestId,
      id(slot),
    );
  }
  @Get('stores/:storeId/reports/summary') report(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Query() q: unknown,
  ) {
    const p = parse(reportSchema, q);
    return this.management.report(a, id(s), p.from, p.to);
  }
  @Get('admin/reports/summary') allReports(@CurrentActor() a: Actor, @Query() q: unknown) {
    const p = parse(reportSchema, q);
    return this.management.report(a, undefined, p.from, p.to);
  }
}
