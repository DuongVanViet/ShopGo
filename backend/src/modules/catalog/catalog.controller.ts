import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../auth/auth.guard';
import { id, pageSchema, parse, uuid } from '../../common/validation';
import { CatalogService } from './catalog.service';

const discoveryPageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).max(200).optional(),
    q: z.string().max(100).optional(),
    categoryId: uuid.optional(),
    inStock: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

const storePageSchema = pageSchema
  .extend({
    q: z.string().trim().max(100).optional(),
    cursor: z.string().min(1).max(60).optional(),
    lat: z.string().trim().min(1).pipe(z.coerce.number<string>().min(-90).max(90)).optional(),
    lng: z.string().trim().min(1).pipe(z.coerce.number<string>().min(-180).max(180)).optional(),
  })
  .strict()
  .refine(({ lat, lng }) => (lat === undefined) === (lng === undefined), {
    message: 'Cần cung cấp cả vĩ độ và kinh độ.',
  });

@Public()
@ApiTags('Catalog')
@Controller('products')
export class ProductDiscoveryController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  products(@Query() query: unknown) {
    return this.catalog.discoverProducts(parse(discoveryPageSchema, query));
  }
}

@Public()
@ApiTags('Catalog')
@Controller('stores')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get() stores(@Query() query: unknown) {
    return this.catalog.stores(parse(storePageSchema, query));
  }
  @Get(':storeId') store(@Param('storeId') storeId: string) {
    return this.catalog.store(id(storeId));
  }
  @Get(':storeId/products') products(@Param('storeId') store: string, @Query() query: unknown) {
    const input = parse(
      pageSchema
        .extend({
          q: z.string().max(100).optional(),
          categoryId: uuid.optional(),
          inStock: z
            .enum(['true', 'false'])
            .transform((v) => v === 'true')
            .optional(),
        })
        .strict(),
      query,
    );
    return this.catalog.products(id(store), input);
  }
  @Get(':storeId/categories') categories(@Param('storeId') store: string) {
    return this.catalog.categories(id(store));
  }
  @Get(':storeId/products/:skuId') product(
    @Param('storeId') store: string,
    @Param('skuId') sku: string,
  ) {
    return this.catalog.products(id(store), { limit: 1 }, id(sku));
  }
  @Get(':storeId/slots') slots(@Param('storeId') store: string, @Query() query: unknown) {
    const input = parse(
      z
        .object({ date: z.string().date().optional(), method: z.literal('PICKUP').optional() })
        .strict(),
      query,
    );
    return this.catalog.slots(id(store), input.date);
  }
}
