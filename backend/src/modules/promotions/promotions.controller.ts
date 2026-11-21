import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { id, money, pageSchema, parse, uuid, version } from '../../common/validation';
import { PromotionsService } from './promotions.service';
const inputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{2,40}$/),
    discountType: z.enum(['FIXED', 'PERCENT']),
    value: money.refine((value) => value > 0),
    minTotal: money.default(0),
    maxDiscount: money.refine((value) => value > 0).optional(),
    quota: z.number().int().min(1).max(1_000_000),
    validFrom: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
  })
  .strict();
@ApiBearerAuth()
@ApiTags('Promotions')
@Controller()
export class PromotionsController {
  constructor(@Inject(PromotionsService) private readonly promotions: PromotionsService) {}
  @Get('stores/:storeId/promotions')
  list(@CurrentActor() actor: Actor, @Param('storeId') storeId: string, @Query() query: unknown) {
    return this.promotions.list(actor, id(storeId), parse(pageSchema.strict(), query));
  }
  @Post('stores/:storeId/promotions')
  create(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.promotions.create(
      actor,
      id(storeId),
      parse(inputSchema, body),
      key,
      request.requestId,
    );
  }
  @Patch('stores/:storeId/promotions/:voucherId')
  toggle(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Param('voucherId') voucherId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.promotions.toggle(
      actor,
      id(storeId),
      id(voucherId),
      parse(z.object({ active: z.boolean(), expectedVersion: version }).strict(), body),
      key,
      request.requestId,
    );
  }
  @Get('cart/vouchers')
  @Header('Cache-Control', 'private, no-store')
  preview(@CurrentActor() actor: Actor, @Query() query: unknown) {
    return this.promotions.preview(
      actor,
      parse(
        z
          .object({
            storeId: uuid,
            code: z.string().trim().min(1).max(40),
            cartVersion: z.coerce.number().int().positive().optional(),
          })
          .strict(),
        query,
      ),
    );
  }
}
