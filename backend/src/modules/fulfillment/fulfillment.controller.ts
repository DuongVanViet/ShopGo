import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { id, money, pageSchema, parse, uuid, version } from '../../common/validation';
import { FulfillmentService } from './fulfillment.service';

const base = z.object({ expectedVersion: version });
const schemas: Record<string, z.ZodObject<any>> = {
  claim: base.strict(),
  ready: base.strict(),
  pick: base
    .extend({
      barcode: z.string().min(1).max(100),
      pickedQuantity: z.number().int().min(0).max(1000),
    })
    .strict(),
  collection: base
    .extend({
      amount: money,
      method: z.literal('CASH'),
      shiftReference: z.string().min(1).max(100),
    })
    .strict(),
  handover: base.extend({ token: z.string().min(32).max(256) }).strict(),
  cancel: base
    .extend({ reason: z.string().min(3).max(500), restockConfirmed: z.boolean().optional() })
    .strict(),
  reassign: base.extend({ pickerId: uuid, reason: z.string().min(3).max(500) }).strict(),
  issue: base
    .extend({
      itemId: uuid,
      quantity: z.number().int().positive().max(1000),
      category: z.enum(['MISSING', 'DAMAGED']),
      note: z.string().min(3).max(1000),
    })
    .strict(),
};

@ApiBearerAuth()
@ApiTags('Fulfillment')
@Controller()
export class FulfillmentController {
  constructor(@Inject(FulfillmentService) private readonly fulfillment: FulfillmentService) {}
  @Get('orders/:id/pickup-token')
  @Header('Cache-Control', 'no-store')
  token(@CurrentActor() actor: Actor, @Param('id') order: string) {
    return this.fulfillment.token(actor, id(order));
  }
  @Post('orders/:id/pickup-token/rotate')
  @Header('Cache-Control', 'no-store')
  rotate(
    @CurrentActor() actor: Actor,
    @Param('id') order: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    return this.fulfillment.rotate(
      actor,
      id(order),
      parse(base.extend({ reason: z.string().max(500).optional() }).strict(), body),
      key,
      req.requestId,
    );
  }
  @Get('stores/:storeId/orders') list(
    @CurrentActor() actor: Actor,
    @Param('storeId') store: string,
    @Query() query: unknown,
  ) {
    return this.fulfillment.list(
      actor,
      id(store),
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
  @Post('stores/:storeId/pickup/lookup')
  @Header('Cache-Control', 'no-store')
  lookup(@CurrentActor() actor: Actor, @Param('storeId') store: string, @Body() body: unknown) {
    return this.fulfillment.lookup(
      actor,
      id(store),
      parse(z.object({ token: z.string().min(32).max(256) }).strict(), body).token,
    );
  }
  private run(
    actor: Actor,
    store: string,
    order: string,
    action: string,
    body: unknown,
    key: string | undefined,
    req: ApiRequest,
    item?: string,
  ) {
    const input = parse(schemas[action], body);
    return this.fulfillment.command(
      actor,
      id(store),
      id(order),
      action,
      item ? { ...input, itemId: id(item) } : input,
      key,
      req.requestId,
    );
  }
  @Post('stores/:storeId/orders/:id/claim') claim(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'claim', b, k, r);
  }
  @Put('stores/:storeId/orders/:id/picking-items/:itemId') pick(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Param('itemId') i: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'pick', b, k, r, i);
  }
  @Post('stores/:storeId/orders/:id/ready') ready(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'ready', b, k, r);
  }
  @Post('stores/:storeId/orders/:id/collections') collect(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'collection', b, k, r);
  }
  @Post('stores/:storeId/orders/:id/handover') handover(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'handover', b, k, r);
  }
  @Post('stores/:storeId/orders/:id/cancel') cancel(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'cancel', b, k, r);
  }
  @Post('stores/:storeId/orders/:id/reassign') reassign(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'reassign', b, k, r);
  }
  @Post('stores/:storeId/orders/:id/issues') issue(
    @CurrentActor() a: Actor,
    @Param('storeId') s: string,
    @Param('id') o: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: ApiRequest,
  ) {
    return this.run(a, s, o, 'issue', b, k, r);
  }
}
