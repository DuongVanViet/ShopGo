import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { id, pageSchema, parse, uuid, version } from '../../common/validation';
import { OrdersService } from './orders.service';

@ApiBearerAuth()
@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}
  @Post() create(
    @CurrentActor() actor: Actor,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    return this.orders.create(
      actor,
      parse(
        z
          .object({
            quoteId: uuid,
            paymentMethod: z.enum(['ONLINE', 'PAY_AT_PICKUP']),
            expectedCartVersion: version,
            expectedStoreId: uuid.optional(),
          })
          .strict(),
        body,
      ),
      key,
      req.requestId,
    );
  }
  @Get() list(@CurrentActor() actor: Actor, @Query() query: unknown) {
    return this.orders.list(
      actor,
      parse(
        pageSchema
          .extend({
            status: z
              .enum([
                'PENDING_PAYMENT',
                'CONFIRMED',
                'PICKING',
                'READY',
                'COMPLETED',
                'CANCELLED',
                'EXPIRED',
              ])
              .optional(),
          })
          .strict(),
        query,
      ),
    );
  }
  @Get(':id') get(@CurrentActor() actor: Actor, @Param('id') order: string) {
    return this.orders.get(actor, id(order));
  }
  @Post(':id/cancel') cancel(
    @CurrentActor() actor: Actor,
    @Param('id') order: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    return this.orders.cancel(
      actor,
      id(order),
      parse(
        z.object({ expectedVersion: version, reason: z.string().min(3).max(500) }).strict(),
        body,
      ),
      key,
      req.requestId,
    );
  }
}
