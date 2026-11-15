import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { id, pageSchema, parse, uuid, version } from '../../common/validation';
import { InventoryService } from './inventory.service';

@ApiBearerAuth()
@ApiTags('Inventory')
@Controller('stores/:storeId/inventory')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}
  @Get() list(@CurrentActor() a: Actor, @Param('storeId') store: string, @Query() query: unknown) {
    const input = parse(
      pageSchema
        .extend({
          q: z.string().max(100).optional(),
          lowStock: z
            .enum(['true', 'false'])
            .transform((v) => v === 'true')
            .optional(),
        })
        .strict(),
      query,
    );
    return this.inventory.list(a, id(store), input);
  }
  @Post('adjustments') adjust(
    @CurrentActor() a: Actor,
    @Param('storeId') store: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    const input = parse(
      z
        .object({
          skuId: uuid,
          delta: z
            .number()
            .int()
            .min(-1_000_000_000)
            .max(1_000_000_000)
            .refine((v) => v !== 0),
          reason: z.string().min(3).max(500),
          expectedVersion: version,
        })
        .strict(),
      body,
    );
    return this.inventory.adjust(a, id(store), input, key, req.requestId);
  }
}
